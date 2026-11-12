// Quests in the app. The rules live in shared/quests.ts (the server uses the
// same copy to work out the score that counts); this file adds what only the
// app knows: the device clock, the signed-in player, and the built-in
// catalog that fills in an animal's group on old sightings.
import type { Sighting } from '@/types';
import { findMockSpecies } from './mockSpecies';
import { crewSeed } from './crew/seed';
import { localZone } from '../../shared/zone';
import * as shared from '../../shared/quests';

export { SEED_QUESTS } from '../../shared/quests';
export type { Quest } from '../../shared/quests';

// The animal group comes from the AI (species.group). Older sightings saved
// before that field existed fall back to the built-in catalog.
export function groupOf(s: Sighting): string | undefined {
  return s.species?.group ?? findMockSpecies(s.species?.scientificName)?.group;
}

// Progress is derived from the journal.
export function questProgress(quest: shared.Quest, sightings: Sighting[]): number {
  return shared.questProgress(quest, sightings, groupOf);
}

// Reward points for every completed quest.
export function questRewardPoints(sightings: Sighting[]): number {
  return shared.questRewardPoints(sightings, groupOf);
}

// When a quest was completed: the sighting that brought it to its goal.
export function questCompletedAt(quest: shared.Quest, sightings: Sighting[]): number | undefined {
  return shared.questCompletedAt(quest, sightings, groupOf);
}

// The player's score as this device sees it: sighting points plus completed
// big quests and Scout's weekly quests. (The number on the leaderboard is
// worked out by the server from the cloud journal, with the same rules.)
export function playerPoints(sightings: Sighting[]): number {
  return shared.playerTotals(sightings, { seed: crewSeed(), zone: localZone, groupOf }).points;
}
