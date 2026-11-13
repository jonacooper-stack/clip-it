import { useEffect, useMemo } from 'react';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore } from '@/state/useAuthStore';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import { playerPoints } from '@/lib/quests';
import { syncMyProfile } from '@/lib/social';

// Keeps the signed-in player's leaderboard row up to date from anywhere in
// the app. The score on the board is the server's (worked out from the cloud
// journal), so normally only the display name is sent. The device's own
// totals are sent only while the server hasn't taken the account over (a
// server or database that hasn't been updated yet).
export function useProfileSync(): void {
  const uid = useAuthStore((s) => s.session?.user?.id);
  const displayName = useAppStore((s) => s.displayName);
  const sightings = useJournalStore((s) => s.sightings);
  // Only when the journal changes, not on every render of the tab bar.
  const points = useMemo(() => playerPoints(sightings), [sightings]);
  const speciesCount = useMemo(() => distinctSpecies(sightings).length, [sightings]);

  const serverKeepsScore = useJournalStore((s) => s.cloud?.ready === true);
  const owner = useJournalStore((s) => s.owner);

  useEffect(() => {
    if (!uid || owner !== uid) return; // not until this account's journal is the one loaded
    // Wait for a pause: answering a few field notes changes the total several
    // times in a row.
    const timer = setTimeout(() => {
      syncMyProfile(displayName, serverKeepsScore ? null : { points, speciesCount }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [uid, owner, displayName, points, speciesCount, serverKeepsScore]);
}
