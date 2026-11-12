// Keeps the journal on this device and the journal in the cloud in step.
//
//   push   sightings the server hasn't got yet (with the receipt it signed,
//          or, for ones scored on the phone before journals moved to the
//          cloud, the phone's own record), the player's changes (field notes,
//          a suggested species, the wall post), and deletions;
//   pull   whatever changed in the cloud since last time (another device, the
//          server's own scoring);
//   photos copies of photos in both directions, a few at a time.
//
// The rules for combining the two are in journalMerge.ts. This file does the
// talking, and takes care that a job started for one account never carries on
// after someone else has signed in.
//
// Nothing here ever blocks the app: if the server can't be reached the
// journal on the device simply stays as it is, and the sync tries again later.
import { Platform } from 'react-native';
import * as Network from 'expo-network';
import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from './supabase';
import { API_BASE, authHeaders, deviceTimeZone, hasServer } from './apiBase';
import { useAuthStore } from '@/state/useAuthStore';
import { useJournalStore, mergeCloud, patchCloud, setJournalChangeListener } from '@/state/useJournalStore';
import { applyPushAnswers, CLOUD_COLUMNS, mergeRows, needsPush, pushItem, worthReidentifying, type CloudRow, type PushAnswer } from './journalMerge';
import { identifySighting, OfflineError, type IdentifyInput, type IdentifyOutcome } from './identify';
import type { Sighting } from '@/types';
import { groupOf } from './quests';
import { resizedBase64 } from './prepareImage';
import { downloadPhoto, resolvePhoto } from './photoStore';
import { cloudPhotoUrl, cloudRefId, isCloudRef } from './cloudPhotos';

const PUSH_BATCH = 40;
const PHOTO_BATCH = 4; // photos per request (each is a few hundred KB)
const PHOTOS_PER_RUN = 12; // uploads and downloads per sync, so one sync never runs for minutes
const PAGE = 500;

// For the "Journal backup" row on the Profile screen.
export const useSyncStatus = create<{ state: 'idle' | 'syncing' | 'waiting'; lastSyncedAt?: number }>(() => ({ state: 'idle' }));

interface SyncAnswer {
  rows?: Record<string, PushAnswer>;
  deleted?: string[];
  totals?: { points: number; speciesCount: number } | null;
  ready?: boolean;
}

class SyncStop extends Error {
  constructor(readonly waitMs: number) {
    super('sync stopped');
  }
}

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let notBefore = 0;
let failures = 0;
const photosTried = new Set<string>(); // photo uploads the server didn't take this session

const cloudOn = () => isSupabaseConfigured && Boolean(supabase) && hasServer;
const signedIn = () => useAuthStore.getState().session?.user?.id ?? null;

// The player has agreed to have their journal saved to their account. Until
// they have, nothing is sent: identifications carry the photo only (as they
// always did) and there is no sync.
export const backupOn = () => cloudOn() && useJournalStore.getState().cloud?.backup === true;
const placesOn = () => useJournalStore.getState().cloud?.places !== false;

// What an identify request says about the sighting, for the cloud journal:
// which sighting it is, whose, when and (unless the player keeps places on
// the phone) where. Nothing at all while the journal isn't being saved.
export function cloudFieldsFor(s: Pick<Sighting, 'id' | 'createdAt' | 'lat' | 'lng' | 'accuracyM' | 'capture' | 'evidence'>): Partial<IdentifyInput> {
  const uid = signedIn();
  if (!backupOn() || !uid || useJournalStore.getState().owner !== uid) return {};
  return {
    sightingId: s.id,
    loggedAt: s.createdAt,
    account: uid,
    capture: s.capture ?? 'camera', // only the in-app camera leaves a capture without saying how it was taken
    evidence: s.evidence,
    ...(placesOn() ? { lat: s.lat, lng: s.lng, accuracyM: s.accuracyM } : { lat: undefined, lng: undefined, accuracyM: undefined }),
  };
}

// A job belongs to the account it started for. This is checked before every
// request and before every change to the journal: if the player has signed
// out, or someone else has signed in, the job stops where it is.
function stillFor(uid: string): boolean {
  return signedIn() === uid && useJournalStore.getState().owner === uid;
}

export function scheduleJournalSync(delayMs = 1500): void {
  if (!backupOn()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncJournal();
  }, delayMs);
}

// Run a sync now (or join the one that's running). `force`: the player asked.
export function syncJournal(opts: { force?: boolean } = {}): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run(opts).finally(() => {
    running = null;
    if (again) {
      again = false;
      scheduleJournalSync(800);
    }
  });
  return running;
}

async function run({ force }: { force?: boolean }): Promise<void> {
  const uid = signedIn();
  if (!backupOn() || !uid || !stillFor(uid)) return;
  if (!force && Date.now() < notBefore) return;
  useSyncStatus.setState({ state: 'syncing' });
  try {
    await push(uid);
    await pull(uid);
    await downloadPhotos(uid);
    await uploadPhotos(uid);
    await reidentify(uid);
    failures = 0;
    notBefore = 0;
    useSyncStatus.setState({ state: 'idle', lastSyncedAt: Date.now() });
  } catch (err) {
    // Wait longer after each failure in a row, or as long as the server asked.
    failures++;
    const wait = err instanceof SyncStop ? err.waitMs : Math.min(30_000 * 2 ** (failures - 1), 3600_000);
    notBefore = Date.now() + wait;
    useSyncStatus.setState({ state: 'waiting' });
  }
}

async function post(uid: string, body: Record<string, unknown>): Promise<SyncAnswer> {
  if (!stillFor(uid)) throw new SyncStop(0);
  const auth = await authHeaders();
  if (!auth) throw new SyncStop(60_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/journal/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ account: uid, tz: deviceTimeZone(), ...body }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (res.ok) return (await res.json()) as SyncAnswer;
  const retryAfter = Number(res.headers.get('Retry-After'));
  // 404: the server hasn't been updated yet. 503: the journal isn't available
  // (database not migrated, or switched off). Neither is this device's fault.
  if (res.status === 503 && retryAfter > 0) throw new SyncStop(Math.min(Math.max(retryAfter, 3), 900) * 1000); // busy: the server says when
  if (res.status === 404 || res.status === 503) throw new SyncStop(15 * 60_000);
  if (res.status === 429) throw new SyncStop(Math.min(Math.max(retryAfter || 60, 60), 86_400) * 1000);
  if (res.status === 401 || res.status === 409) throw new SyncStop(2 * 60_000);
  throw new Error(`sync ${res.status}`);
}

function takeAnswer(uid: string, answer: SyncAnswer, sentRevs: ReadonlyMap<string, number>): void {
  if (!stillFor(uid)) throw new SyncStop(0);
  const now = Date.now();
  useJournalStore.getState().applySync((st) => ({
    sightings: applyPushAnswers(st.sightings, answer.rows ?? {}, sentRevs, now),
    pendingDeletes: answer.deleted?.length ? st.pendingDeletes.filter((id) => !answer.deleted!.includes(id)) : st.pendingDeletes,
    cloud: mergeCloud(st.cloud, { ready: answer.ready === true, totals: answer.totals ?? st.cloud?.totals ?? null }),
  }));
}

async function push(uid: string): Promise<void> {
  // Bounded: each round must make progress, or the loop ends.
  for (let round = 0; round < 200; round++) {
    const st = useJournalStore.getState();
    const todo = st.sightings.filter(needsPush).slice(0, PUSH_BATCH);
    const deletes = st.pendingDeletes.slice(0, 100);
    // The first sync also goes out with nothing to send: that is what
    // switches the account to server-kept scores and brings back its totals.
    if (!todo.length && !deletes.length && (st.cloud?.ready || round > 0)) return;
    const sentRevs = new Map(todo.map((s) => [s.id, s.rev ?? 0] as const));
    const answer = await post(uid, { items: todo.map((s) => pushItem(s, groupOf, { places: placesOn() })), deletes });
    takeAnswer(uid, answer, sentRevs);
    const progressed = todo.some((s) => answer.rows?.[s.id]) || (answer.deleted?.length ?? 0) > 0;
    if (!progressed) return;
  }
}

async function pull(uid: string): Promise<void> {
  if (!supabase) return;
  const since = useJournalStore.getState().cloud?.pulledAt;
  let newest = since;
  for (let from = 0; from < 100_000; from += PAGE) {
    if (!stillFor(uid)) throw new SyncStop(0);
    let q = supabase.from('journal_sightings').select(CLOUD_COLUMNS).order('updated_at', { ascending: true }).order('id', { ascending: true });
    // From the last change seen, inclusive: reading a row twice is harmless, missing one is not.
    if (since) q = q.gte('updated_at', since);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) {
      // The table isn't there yet (migration not run): nothing to pull.
      if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') return;
      throw new Error(error.message);
    }
    const rows = (data ?? []) as unknown as CloudRow[];
    if (!stillFor(uid)) throw new SyncStop(0);
    for (const r of rows) if (r.updated_at && (!newest || r.updated_at > newest)) newest = r.updated_at;
    if (rows.length) {
      const now = Date.now();
      // One step per page: the journal is saved once, not once per sighting.
      useJournalStore.getState().applySync((st) => {
        const merged = mergeRows(st.sightings, st.pendingDeletes, rows, now);
        return { sightings: merged.sightings, pendingDeletes: merged.pendingDeletes };
      });
    }
    if (rows.length < PAGE) break;
  }
  if (newest && newest !== since) {
    patchCloud({ pulledAt: newest });
  }
}

// Photos the cloud has and this phone doesn't (a new phone, a reinstall):
// bring a few down per sync. On the web they are shown straight from the
// cloud instead (lib/usePhoto), so there is nothing to do.
async function downloadPhotos(uid: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const missing = useJournalStore.getState().sightings.filter((s) => isCloudRef(s.photoUri)).slice(0, PHOTOS_PER_RUN);
  for (const s of missing) {
    if (!stillFor(uid)) throw new SyncStop(0);
    const url = await cloudPhotoUrl(cloudRefId(s.photoUri!));
    if (!url) continue;
    const ref = await downloadPhoto(url, s.id);
    if (ref && stillFor(uid)) useJournalStore.getState().updateSighting(s.id, { photoUri: ref });
  }
}

async function onWifi(): Promise<boolean> {
  try {
    const net = await Network.getNetworkStateAsync();
    return net.type === Network.NetworkStateType.WIFI || net.type === Network.NetworkStateType.ETHERNET;
  } catch {
    return false;
  }
}

// Photos this phone has and the cloud doesn't: sightings from before journals
// moved to the cloud, and any whose copy didn't arrive when it was
// identified. Sent after the sightings themselves (the journal and the score
// don't wait for them), a few per sync, and only on Wi-Fi.
async function uploadPhotos(uid: string): Promise<void> {
  if (Platform.OS === 'web') return; // a browser tab's photos don't outlive the page
  const waiting = useJournalStore
    .getState()
    .sightings.filter((s) => s.cloudAt && s.cloudPhoto === false && s.photoUri && !isCloudRef(s.photoUri) && !photosTried.has(s.id))
    .slice(0, PHOTOS_PER_RUN);
  if (!waiting.length || !(await onWifi())) return;
  for (let i = 0; i < waiting.length; i += PHOTO_BATCH) {
    const items: { id: string; photoBase64: string }[] = [];
    for (const s of waiting.slice(i, i + PHOTO_BATCH)) {
      photosTried.add(s.id); // once per session: a photo the server won't take isn't offered again and again
      const uri = resolvePhoto(s.photoUri);
      const photoBase64 = uri ? await resizedBase64(uri) : undefined;
      if (photoBase64) items.push({ id: s.id, photoBase64 });
    }
    if (!items.length) continue;
    const answer = await post(uid, { items });
    if (!stillFor(uid)) throw new SyncStop(0);
    const stored = new Set(items.filter((it) => (answer.rows?.[it.id] as CloudRow | undefined)?.has_photo === true).map((it) => it.id));
    if (stored.size) {
      useJournalStore.getState().applySync((st) => ({ sightings: st.sightings.map((s) => (stored.has(s.id) ? { ...s, cloudPhoto: true } : s)) }));
    }
  }
}

// The account is about to be deleted: have the server remove the photos it
// stores for the journal (only the server can). Best effort: the nightly job
// clears anything left behind.
export async function purgeCloudPhotos(): Promise<void> {
  const uid = signedIn();
  if (!cloudOn() || !uid) return;
  try {
    const auth = await authHeaders();
    if (!auth) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    await fetch(`${API_BASE}/api/journal/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ account: uid, purge: true }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // the nightly job removes them
  }
}

// Sightings the phone scored that the server counts for nothing: ones that
// reached it after the cut-off for phone-scored sightings, or from an account
// with no allowance for them (every new install plays its first session on
// the app version it shipped with). While the photo is still on this phone
// nothing is lost: the server identifies it now, under the same sighting id,
// and from then on it is a sighting the server scored itself. A few per sync;
// each one is a normal identification and counts toward the daily limits.
const reidentified = new Set<string>();
async function reidentify(uid: string): Promise<void> {
  if (Platform.OS === 'web') return; // a browser tab's photos don't outlive the page
  const todo = useJournalStore
    .getState()
    .sightings.filter((s) => worthReidentifying(s) && s.photoUri && !isCloudRef(s.photoUri) && !reidentified.has(s.id))
    .slice(0, 3);
  for (const s of todo) {
    if (!stillFor(uid)) throw new SyncStop(0);
    reidentified.add(s.id); // once per session
    const uri = resolvePhoto(s.photoUri);
    const photoBase64 = uri ? await resizedBase64(uri) : undefined;
    if (!photoBase64) continue;
    let outcome: IdentifyOutcome;
    try {
      outcome = await identifySighting({ photoBase64, observedAt: s.observedAt, ...cloudFieldsFor(s) });
    } catch (err) {
      // Signed out, over a limit, or offline: leave the rest for another day.
      if (err instanceof OfflineError) return;
      continue;
    }
    if (!stillFor(uid)) throw new SyncStop(0);
    if (outcome.source !== 'ai') continue; // a stand-in result (development builds): not the server's word
    const row = outcome.recorded ? outcome.journal : undefined;
    useJournalStore.getState().applySync((st) => ({
      sightings: st.sightings.map((x) => {
        if (x.id !== s.id) return x;
        if (row && !row.deleted_at) {
          return {
            ...x,
            species: outcome.species ?? x.species,
            sceneTags: outcome.sceneTags,
            dangerous: outcome.dangerous,
            points: row.points,
            score: row.score ?? undefined,
            verified: row.verified,
            cloudPoints: row.points,
            cloudPhoto: row.has_photo,
          };
        }
        // The server looked and says it can't score (not a wild animal, or not the player's own photo).
        if (outcome.present && !outcome.eligible) return { ...x, idStatus: 'ineligible' as const, ineligibleReason: outcome.ineligibleReason, points: undefined, score: undefined, cloudSkip: true };
        return x;
      }),
    }));
  }
}

// How many things are waiting to go to the cloud (for the Profile screen).
export function pendingCount(sightings: Parameters<typeof needsPush>[0][], pendingDeletes: string[]): number {
  return sightings.filter(needsPush).length + pendingDeletes.length;
}

// A change by the player (field notes, a suggestion, a delete) is sent shortly after.
setJournalChangeListener(() => scheduleJournalSync());
