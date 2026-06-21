import type { Quest, Sighting } from '@/types';
import { findMockSpecies } from './mockSpecies';
import { distinctSpecies } from '@/state/useJournalStore';

export const SEED_QUESTS: Quest[] = [
  { id: 'first-catch', title: 'First Catch', description: 'Log your very first animal', goal: 1, rewardPoints: 10, group: 'any' },
  { id: 'birdwatcher', title: 'Birdwatcher', description: 'Photograph 3 different birds', goal: 3, rewardPoints: 25, group: 'bird' },
  { id: 'naturalist', title: 'Naturalist', description: 'Collect 5 different species', goal: 5, rewardPoints: 40, group: 'any' },
  { id: 'mammal-tracker', title: 'Mammal Tracker', description: 'Find 3 different mammals', goal: 3, rewardPoints: 25, group: 'mammal' },
];

// Progress is derived from the journal. In production this would use real
// taxonomy; here it leans on the dev catalog's group field.
export function questProgress(quest: Quest, sightings: Sighting[]): number {
  let species = distinctSpecies(sightings);
  if (quest.group && quest.group !== 'any') {
    species = species.filter((s) => findMockSpecies(s.species?.scientificName)?.group === quest.group);
  }
  return Math.min(species.length, quest.goal);
}
