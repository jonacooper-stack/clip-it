import type { Quest, Sighting } from '@/types';
import { findMockSpecies } from './mockSpecies';
import { distinctSpecies, totalPoints } from '@/state/useJournalStore';

export const SEED_QUESTS: Quest[] = [
  { id: 'first-catch', title: 'First Sighting', description: 'Photograph your very first animal', goal: 1, rewardPoints: 10, group: 'any' },
  { id: 'birdwatcher', title: 'Birdwatcher', description: 'Photograph 3 different birds', goal: 3, rewardPoints: 25, group: 'bird' },
  { id: 'naturalist', title: 'Naturalist', description: 'Collect 5 different species', goal: 5, rewardPoints: 40, group: 'any' },
  { id: 'mammal-tracker', title: 'Mammal Tracker', description: 'Find 3 different mammals', goal: 3, rewardPoints: 25, group: 'mammal' },
];

// The animal group comes from the AI (species.group). Older sightings saved
// before that field existed fall back to the built-in catalog.
function groupOf(s: Sighting): string | undefined {
  return s.species?.group ?? findMockSpecies(s.species?.scientificName)?.group;
}

// Progress is derived from the journal.
export function questProgress(quest: Quest, sightings: Sighting[]): number {
  let species = distinctSpecies(sightings);
  if (quest.group && quest.group !== 'any') {
    species = species.filter((s) => groupOf(s) === quest.group);
  }
  return Math.min(species.length, quest.goal);
}

// Reward points for every completed quest.
export function questRewardPoints(sightings: Sighting[]): number {
  return SEED_QUESTS.filter((q) => questProgress(q, sightings) >= q.goal).reduce((n, q) => n + q.rewardPoints, 0);
}

// The player's score: sighting points plus completed-quest rewards. Use this
// anywhere a total is shown or synced to the leaderboard.
export function playerPoints(sightings: Sighting[]): number {
  return totalPoints(sightings) + questRewardPoints(sightings);
}
