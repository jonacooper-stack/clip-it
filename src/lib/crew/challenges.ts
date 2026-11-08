// Moss's weekly challenges: three per week (Monday–Sunday, local time), picked
// from a pool with a seed so they're stable, scored from the journal. Pure
// functions: no storage, so rewards can be recomputed for any past week.
import type { Sighting } from '@/types';
import { addWeeks, dayKey, seededRandom, startOfWeek } from './time';

export type GroupOf = (s: Sighting) => string | undefined;

interface Ctx {
  week: Sighting[]; // counted sightings in the week
  before: Sighting[]; // counted sightings before the week
  groupOf: GroupOf;
}

export interface ChallengeDef {
  id: string;
  title: string;
  description: string;
  goal: number;
  reward: number;
  easy?: boolean;
  progress: (c: Ctx) => number;
}

const speciesOf = (s: Sighting) => s.species?.scientificName || s.species?.commonName || '';
const distinct = (xs: Sighting[], f: (s: Sighting) => boolean = () => true) =>
  new Set(xs.filter(f).map(speciesOf).filter(Boolean)).size;

export const CHALLENGE_POOL: ChallengeDef[] = [
  {
    id: 'new_species',
    title: 'New to you',
    description: 'Log 2 species you’ve never logged before',
    goal: 2,
    reward: 20,
    progress: ({ week, before }) => {
      const seen = new Set(before.map(speciesOf));
      return new Set(week.map(speciesOf).filter((n) => n && !seen.has(n))).size;
    },
  },
  { id: 'birds', title: 'Feathers', description: 'Photograph 2 different birds', goal: 2, reward: 15, progress: ({ week, groupOf }) => distinct(week, (s) => groupOf(s) === 'bird') },
  { id: 'mammals', title: 'Fur & whiskers', description: 'Photograph 2 different mammals', goal: 2, reward: 15, progress: ({ week, groupOf }) => distinct(week, (s) => groupOf(s) === 'mammal') },
  {
    id: 'behavior',
    title: 'Caught in the act',
    description: 'Catch an animal doing something: with young, in flight, courting, hunting or in a group',
    goal: 1,
    reward: 20,
    progress: ({ week }) => week.filter((s) => s.sceneTags.length > 0).length,
  },
  { id: 'days', title: 'Out and about', description: 'Log sightings on 3 different days', goal: 3, reward: 15, easy: true, progress: ({ week }) => new Set(week.map((s) => dayKey(s.observedAt))).size },
  { id: 'busy', title: 'Busy week', description: 'Log 6 sightings', goal: 6, reward: 10, easy: true, progress: ({ week }) => week.length },
  { id: 'rare', title: 'Rare air', description: 'Find something rarer than the usual suspects', goal: 1, reward: 25, progress: ({ week }) => week.filter((s) => (s.score?.basePoints ?? 0) >= 5).length },
  {
    id: 'notes',
    title: 'Field notes',
    description: 'Add field notes to 2 sightings',
    goal: 2,
    reward: 10,
    easy: true,
    progress: ({ week }) => week.filter((s) => s.science && Object.keys(s.science).length > 0).length,
  },
  {
    id: 'herps',
    title: 'Scales & slime',
    description: 'Find a reptile or amphibian',
    goal: 1,
    reward: 25,
    progress: ({ week, groupOf }) => week.filter((s) => ['reptile', 'amphibian'].includes(groupOf(s) ?? '')).length,
  },
];

export const SWEEP_BONUS = 10; // all three done

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';

// This week's three: one easy one plus two others, chosen by seed.
export function weeklyChallenges(weekStart: number, seed: string): ChallengeDef[] {
  const rand = seededRandom(`${seed}:${new Date(weekStart).toDateString()}:moss`);
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const easy = shuffle(CHALLENGE_POOL.filter((c) => c.easy))[0];
  const rest = shuffle(CHALLENGE_POOL.filter((c) => !c.easy)).slice(0, 2);
  return [...rest, easy];
}

export interface ChallengeStatus {
  def: ChallengeDef;
  progress: number;
  done: boolean;
  doneAt?: number; // when the sighting that completed it was logged
}

export function challengeStatus(weekStart: number, sightings: Sighting[], seed: string, groupOf: GroupOf): ChallengeStatus[] {
  const end = addWeeks(weekStart, 1);
  const counted = sightings.filter(COUNTED).sort((a, b) => a.observedAt - b.observedAt);
  const before = counted.filter((s) => s.observedAt < weekStart);
  const week = counted.filter((s) => s.observedAt >= weekStart && s.observedAt < end);
  return weeklyChallenges(weekStart, seed).map((def) => {
    const progress = Math.min(def.progress({ week, before, groupOf }), def.goal);
    let doneAt: number | undefined;
    if (progress >= def.goal) {
      // The first moment it was complete: replay the week sighting by sighting.
      for (let i = 1; i <= week.length; i++) {
        if (def.progress({ week: week.slice(0, i), before, groupOf }) >= def.goal) {
          doneAt = week[i - 1].observedAt;
          break;
        }
      }
    }
    return { def, progress, done: progress >= def.goal, doneAt };
  });
}

// Points earned from Moss's challenges across every week with sightings.
export function challengeRewardPoints(sightings: Sighting[], seed: string, groupOf: GroupOf, now = Date.now()): number {
  const counted = sightings.filter(COUNTED);
  if (!counted.length) return 0;
  const weeks = new Set(counted.map((s) => startOfWeek(s.observedAt)));
  let total = 0;
  for (const w of weeks) {
    if (w > now) continue;
    const status = challengeStatus(w, sightings, seed, groupOf);
    total += status.filter((c) => c.done).reduce((n, c) => n + c.def.reward, 0);
    if (status.every((c) => c.done)) total += SWEEP_BONUS;
  }
  return total;
}
