// Scout's weekly quests. The rules live in shared/quests.ts (the server works
// out the rewards with the same code); this file keeps the app's imports.
import type { Sighting } from '@/types';

export {
  CHALLENGE_POOL,
  SWEEP_BONUS,
  weeklyChallenges,
  challengeStatus,
  challengeRewardPoints,
  type ChallengeDef,
  type ChallengeStatus,
} from '../../../shared/quests';

export type GroupOf = (s: Sighting) => string | undefined;
