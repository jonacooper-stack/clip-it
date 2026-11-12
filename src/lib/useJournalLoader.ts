// Loads the right journal for whoever is signed in, and reloads it whenever
// that changes (sign-in, sign-out, a session restored after a spell offline).
// After every load: pick up captures that were interrupted, send anything
// queued for identification, and sync with the cloud.
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/state/useAuthStore';
import { journalStorage, loadJournalFor } from '@/state/useJournalStore';
import { processAnalysisQueue, recoverInterruptedCaptures } from './analysis';
import { scheduleJournalSync } from './journalSync';
import { clearCloudPhotos } from './cloudPhotos';
import { askYesNo } from './dialogs';

// (Whether the journal is saved to the account at all is the player's choice,
// kept on the account: the sync reads it, and asks an account that has never
// answered. See lib/journalSync and lib/backupChoice.)
function afterLoad(uid: string | null): void {
  recoverInterruptedCaptures();
  void processAnalysisQueue();
  if (uid) scheduleJournalSync(800);
}

// This phone holds sightings from before journals belonged to accounts, and
// nobody has claimed them. Whoever was signed in when this version first
// started got them without being asked; anyone signing in later is asked.
function askAboutSavedSightings(uid: string, count: number): void {
  askYesNo(
    'Sightings saved on this phone',
    `This phone has ${count} sighting${count === 1 ? '' : 's'} saved from before you signed in. If they’re yours, add them to your journal. (If your journal is saved to your account, they will be saved with it.)`,
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
