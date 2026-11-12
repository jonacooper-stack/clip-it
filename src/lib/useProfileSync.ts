import { useEffect } from 'react';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore } from '@/state/useAuthStore';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import { playerPoints } from '@/lib/quests';
import { syncMyProfile } from '@/lib/social';

// Keeps the signed-in player's leaderboard row (name, points, species count)
// up to date from anywhere in the app, a moment after their totals change.
// (It used to sync only while the Community tab was open, so players who never
// opened it stayed at their old score on everyone else's board.)
export function useProfileSync(): void {
  const uid = useAuthStore((s) => s.session?.user?.id);
  const displayName = useAppStore((s) => s.displayName);
  const sightings = useJournalStore((s) => s.sightings);
  const points = playerPoints(sightings);
  const speciesCount = distinctSpecies(sightings).length;

  useEffect(() => {
    if (!uid) return;
    // Wait for a pause: answering a few field notes changes the total several
    // times in a row.
    const timer = setTimeout(() => {
      syncMyProfile(displayName, points, speciesCount).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [uid, displayName, points, speciesCount]);
}
