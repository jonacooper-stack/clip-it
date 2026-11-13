// The journal as the quests count it.
//
// While this device keeps its own score, that is simply the journal. Once the
// server keeps the account's score, it is the journal as the server counts it
// (see journalMerge asTheServerCounts): quest progress shown on this device
// then matches the rewards that end up in the score.
import { useMemo } from 'react';
import type { Sighting } from '@/types';
import { useJournalStore } from '@/state/useJournalStore';
import { asTheServerCounts } from './journalMerge';

export function useQuestSightings(): Sighting[] {
  const sightings = useJournalStore((s) => s.sightings);
  const serverKeepsScore = useJournalStore((s) => s.cloud?.ready === true);
  return useMemo(() => (serverKeepsScore ? asTheServerCounts(sightings) : sightings), [sightings, serverKeepsScore]);
}
