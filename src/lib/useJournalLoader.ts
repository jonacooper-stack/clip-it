// Loads the right journal for whoever is signed in, and reloads it whenever
// that changes (sign-in, sign-out, a session restored after a spell offline).
// After every load: pick up captures that were interrupted, send anything
// queued for identification, and sync with the cloud.
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/state/useAuthStore';
import { journalStorage, loadJournalFor, setCloudChoice, useJournalStore } from '@/state/useJournalStore';
import { supabase, isSupabaseConfigured } from './supabase';
import { processAnalysisQueue, recoverInterruptedCaptures } from './analysis';
import { scheduleJournalSync } from './journalSync';
import { belongsInCloud } from './journalMerge';
import { clearCloudPhotos } from './cloudPhotos';
import { askYesNo } from './dialogs';

function afterLoad(uid: string | null): void {
  recoverInterruptedCaptures();
  void processAnalysisQueue();
  if (uid) void settleBackupChoice(uid).then(() => scheduleJournalSync(800));
}

// Saving the journal to the account is new. A player who already has a
// journal on this phone was told it stays on the phone, so they are asked
// once before anything from it is uploaded. Nothing is sent until they say
// yes. An account with nothing on the phone yet (a new account, or a new
// phone) isn't asked: the privacy policy it signed up under covers it, and on
// a new phone the journal can only come back from the account.
async function settleBackupChoice(uid: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const mine = () => useAuthStore.getState().session?.user?.id === uid && useJournalStore.getState().owner === uid;
  const st = useJournalStore.getState();
  if (!mine() || st.cloud?.backup !== undefined) return; // already answered
  if (!st.sightings.some(belongsInCloud)) return setCloudChoice({ backup: true });
  // Already said yes on another device? (The account has switched to the cloud journal.)
  try {
    const { data } = await supabase.from('journal_state').select('ready_at').eq('user_id', uid).maybeSingle();
    if (!mine()) return;
    if ((data as { ready_at?: string | null } | null)?.ready_at) return setCloudChoice({ backup: true });
  } catch {
    // can't tell: ask
  }
  askAboutBackup(uid);
}

export function askAboutBackup(uid: string): void {
  askYesNo(
    'Save your journal to your account?',
    'ClipIt can now keep your journal with your account: each sighting’s species, time, place and a copy of its photo. Only you can see it. A new phone or a reinstall won’t lose it, and from now on it is how your score counts on the leaderboard.\n\nYou can turn this off, or keep places on this phone only, in Profile.',
    'Save my journal',
    'Not now',
    () => {
      if (useJournalStore.getState().owner !== uid) return;
      setCloudChoice({ backup: true });
      scheduleJournalSync(300);
    },
    () => {
      if (useJournalStore.getState().owner === uid) setCloudChoice({ backup: false });
    },
  );
}

// This phone holds sightings from before journals belonged to accounts, and
// nobody has claimed them. Whoever was signed in when this version first
// started got them without being asked; anyone signing in later is asked.
function askAboutSavedSightings(uid: string, count: number): void {
  askYesNo(
    'Sightings saved on this phone',
    `This phone has ${count} sighting${count === 1 ? '' : 's'} saved from before you signed in. If they’re yours, add them to your journal.`,
    'They’re mine',
    'Not mine',
    async () => {
      if (await journalStorage.claim(uid)) {
        const res = await loadJournalFor(uid);
        if (res.loaded) afterLoad(uid);
      }
    },
    () => void journalStorage.decline(uid),
  );
}

export function useJournalLoader(): void {
  const authInitialized = useAuthStore((s) => s.initialized);
  const uid = useAuthStore((s) => s.session?.user?.id ?? null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!authInitialized) return;
    // The account already signed in when the app starts is the person who
    // has been using this phone (see journalStorage.ts).
    const mayClaim = firstLoad.current;
    firstLoad.current = false;
    let current = true;
    clearCloudPhotos(); // photo links belong to an account
    loadJournalFor(uid, { mayClaim }).then((res) => {
      if (!current || !res.loaded) return;
      afterLoad(uid);
      if (uid && res.unclaimed > 0) askAboutSavedSightings(uid, res.unclaimed);
    });
    return () => {
      current = false;
    };
  }, [authInitialized, uid]);
}
