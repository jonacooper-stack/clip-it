// The field journal on this device.
//
// One journal per account (see journalStorage.ts for where each is kept and
// why). Nothing is loaded when the app starts: loadJournalFor() loads the
// signed-in account's journal once the app knows who that is, and again on
// every sign-in or sign-out. Until then the journal is empty.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Sighting } from '@/types';
import { deletePhoto } from '@/lib/photoStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createJournalStorage, DEVICE_KEY, LOCAL_OWNER, type OpenResult } from './journalStorage';
import { mergeCloud, repairSighting, type CloudState } from '@/lib/journalMerge';

export { mergeCloud, type CloudState };

interface JournalState {
  /** The first load has finished (true from then on, whoever is signed in). */
  hasHydrated: boolean;
  /** Whose journal is in memory: an account id, null (signed out, or local-only mode), undefined (nothing loaded yet). Not saved. */
  owner: string | null | undefined;
  sightings: Sighting[];
  /** Sightings deleted here that the server hasn't been told about yet. */
  pendingDeletes: string[];
  cloud: CloudState | null;

  addSighting: (s: Sighting) => void;
  /** Change a sighting (identification results, Scout's notes, retry state…). */
  updateSighting: (id: string, patch: Partial<Sighting>) => void;
  /** A change by the player that the cloud keeps too (field notes, a suggested species, the wall post). */
  editSighting: (id: string, patch: Partial<Sighting>) => void;
  /** Remove a sighting. `quiet`: don't tell the cloud (it was never there, or the cloud is why it's going). */
  removeSighting: (id: string, opts?: { quiet?: boolean }) => void;
  /** For the sync: replace parts of the journal in one step. */
  applySync: (fn: (st: Pick<JournalState, 'sightings' | 'pendingDeletes' | 'cloud'>) => Partial<Pick<JournalState, 'sightings' | 'pendingDeletes' | 'cloud'>>) => void;
}

// Whether the last attempt to save the journal on this device worked. (It can
// fail when the device's storage is full; the journal in memory is then ahead
// of what is saved.)
export const useJournalSave = create<{ failed: boolean }>(() => ({ failed: false }));

export const journalStorage = createJournalStorage(AsyncStorage, isSupabaseConfigured, (ok) => {
  if (useJournalSave.getState().failed === ok) useJournalSave.setState({ failed: !ok });
});

// Told when the player changes something the cloud keeps (set by lib/journalSync).
let onLocalChange: () => void = () => {};
export function setJournalChangeListener(fn: () => void): void {
  onLocalChange = fn;
}

// Statuses the server may hold a row for (or be about to): removing one of
// these has to be passed on. A photo that didn't count never reached the cloud.
const MAY_BE_IN_CLOUD: ReadonlySet<string> = new Set(['identifying', 'queued', 'ai_confident', 'needs_review', 'human_confirmed', 'disputed']);

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      owner: undefined,
      sightings: [],
      pendingDeletes: [],
      cloud: null,

      addSighting: (s) => set((st) => ({ sightings: [s, ...st.sightings] })),
      updateSighting: (id, patch) =>
        set((st) => ({
          sightings: st.sightings.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      editSighting: (id, patch) => {
        set((st) => ({
          sightings: st.sightings.map((s) => (s.id === id ? { ...s, ...patch, rev: (s.rev ?? 0) + 1 } : s)),
        }));
        onLocalChange();
      },
      // Removing a sighting also deletes its photo file from the device.
      removeSighting: (id, opts = {}) => {
        let tellCloud = false;
        set((st) => {
          const gone = st.sightings.find((s) => s.id === id);
          if (!gone) return {};
          if (gone.photoUri) void deletePhoto(gone.photoUri);
          tellCloud = isSupabaseConfigured && !opts.quiet && gone.source !== 'mock' && MAY_BE_IN_CLOUD.has(gone.idStatus);
          return {
            sightings: st.sightings.filter((s) => s.id !== id),
            // In the same step, so a sync can never see the sighting gone but the deletion not yet queued.
            pendingDeletes: tellCloud && !st.pendingDeletes.includes(id) ? [...st.pendingDeletes, id] : st.pendingDeletes,
          };
        });
        if (tellCloud) onLocalChange();
      },
      applySync: (fn) => set((st) => fn({ sightings: st.sightings, pendingDeletes: st.pendingDeletes, cloud: st.cloud })),
    }),
    {
      name: DEVICE_KEY,
      storage: createJSONStorage(() => journalStorage.adapter),
      // The journal is loaded by loadJournalFor, never by this layer.
      skipHydration: true,
      // What is saved. The journal is stamped with whose it is, so it can
      // never be loaded into another account by mistake.
      partialize: (st) => ({
        sightings: st.sightings,
        pendingDeletes: st.pendingDeletes,
        cloud: st.cloud,
        owner: isSupabaseConfigured ? st.owner ?? undefined : LOCAL_OWNER,
      }),
    },
  ),
);

// A browser tab's photos (blob: links) die with the page. After a reload they
// only leave broken pictures behind, so the first load of a page drops them;
// sightings that are in the cloud get their photo back from there.
let pageJustLoaded = Platform.OS === 'web';

function tidy(state: Record<string, unknown> | null): Pick<JournalState, 'sightings' | 'pendingDeletes' | 'cloud'> {
  const dropDead = pageJustLoaded;
  pageJustLoaded = false;
  const sightings = (Array.isArray(state?.sightings) ? (state!.sightings as Sighting[]) : [])
    .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
    .map(repairSighting)
    .map((s) => (dropDead && typeof s.photoUri === 'string' && s.photoUri.startsWith('blob:') ? { ...s, photoUri: s.cloudPhoto ? `cloud:${s.id}` : undefined } : s));
  const pendingDeletes = Array.isArray(state?.pendingDeletes) ? (state!.pendingDeletes as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const c = state?.cloud as CloudState | null | undefined;
  const cloud: CloudState | null =
    c && typeof c === 'object'
      ? {
          ready: c.ready === true,
          totals: c.totals && typeof c.totals.points === 'number' && typeof c.totals.speciesCount === 'number' ? { points: c.totals.points, speciesCount: c.totals.speciesCount } : null,
          pulledAt: typeof c.pulledAt === 'string' ? c.pulledAt : undefined,
          backup: typeof c.backup === 'boolean' ? c.backup : undefined,
          places: typeof c.places === 'boolean' ? c.places : undefined,
          saved:
            c.saved && typeof c.saved === 'object'
              ? { backup: c.saved.backup === 'yes' || c.saved.backup === 'no' ? c.saved.backup : null, places: c.saved.places === true }
              : undefined,
          erase: c.erase === true ? true : undefined,
          epoch: typeof c.epoch === 'string' ? c.epoch : c.epoch === null ? null : undefined,
        }
      : null;
  return { sightings, pendingDeletes, cloud };
}

// Load `uid`'s journal (null: signed out). `mayClaim`: this account was
// already signed in when the app started (see journalStorage.ts). The result
// says whether this call's journal is the one now loaded, and how many
// unclaimed sightings are on the device that this account could be asked about.
export function loadJournalFor(uid: string | null, opts: { mayClaim?: boolean } = {}): Promise<OpenResult> {
  return journalStorage.open(
    uid,
    {
      // Everything that belongs to an account is emptied, so nothing of the
      // previous one can carry over.
      clear: () => useJournalStore.setState({ owner: undefined, sightings: [], pendingDeletes: [], cloud: null }),
      fill: (state) => useJournalStore.setState({ ...tidy(state), owner: uid, hasHydrated: true }),
    },
    opts,
  );
}

// Erase an account's journal and its photo files from this device (account
// deletion, "reset app data"). Works whether or not that journal is loaded.
export async function purgeJournal(uid: string | null): Promise<void> {
  const photos = await journalStorage.purge(uid);
  if (useJournalStore.getState().owner === uid) useJournalStore.setState({ sightings: [], pendingDeletes: [], cloud: null });
  await Promise.all(photos.map((ref) => deletePhoto(ref)));
  // Local-only mode has no sign-out to follow: start a fresh journal now.
  if (!isSupabaseConfigured) await loadJournalFor(null);
}

// What counts toward the journal and score is decided in shared/quests.ts
// (one copy for app and server).
export { totalPoints, distinctSpecies } from '../../shared/quests';

// Change part of the cloud state, keeping the rest (see mergeCloud).
export function patchCloud(patch: Partial<CloudState>): void {
  useJournalStore.getState().applySync((st) => ({ cloud: mergeCloud(st.cloud, patch) }));
}

// Record one of the player's choices about the cloud journal.
export function setCloudChoice(choice: { backup?: boolean; places?: boolean }): void {
  patchCloud(choice);
}
