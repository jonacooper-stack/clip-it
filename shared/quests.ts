// Quests: the big ones every player works through, and Scout's three weekly
// quests. Pure functions over a journal, used by the app (to show progress)
// and by the server (which works out the rewards that count on the
// leaderboard). Both must get the same answer, so anything that depends on
// the calendar takes a Zone: the phone passes its own clock, the server
// passes the player's time zone (see shared/zone.ts).
//
// Keep this file free of React Native and Node-only imports.
import { localZone, type Zone } from './zone';

// The parts of a sighting that quests and totals look at. The app's Sighting
// and the server's journal rows both fit.
export interface QuestSighting {
  idStatus: string;
  points?: number;
  observedAt: number;
  species?: { scientificName: string; commonName: string; group?: string };
  sceneTags: string[];
  science?: Record<string, unknown>;
  score?: { basePoints: number };
}

export type GroupOf<S extends QuestSighting = QuestSighting> = (s: S) => string | undefined;
const ownGroup = (s: QuestSighting) => s.species?.group;

// ---------- what counts ----------
// Sightings that don't count toward the journal or score: no animal, or an
// identified-but-ineligible subject (a pet or a person).
const UNCOUNTED: ReadonlySet<string> = new Set(['rejected', 'ineligible']);
const COUNTED = (s: QuestSighting) => !UNCOUNTED.has(s.idStatus) && typeof s.points === 'number';

// Points from sightings alone.
export function totalPoints(sightings: QuestSighting[]): number {
  return sightings.filter(COUNTED).reduce((sum, s) => sum + (s.points ?? 0), 0);
}

// One sighting per species, the first of each in the order given.
export function distinctSpecies<S extends QuestSighting>(sightings: S[]): S[] {
  const byName = new Map<string, S>();
  for (const s of sightings) {
    if (!s.species || UNCOUNTED.has(s.idStatus)) continue;
    if (!byName.has(s.species.scientificName)) byName.set(s.species.scientificName, s);
  }
  return [...byName.values()];
}

// ---------- the big quests ----------
export interface Quest {
  id: string;
  title: string;
  description: string;
  goal: number;
  rewardPoints: number;
  /** Optional broad group the sightings must belong to. */
  group?: 'bird' | 'mammal' | 'any';
}

export const SEED_QUESTS: Quest[] = [
  { id: 'first-catch', title: 'First Sighting', description: 'Photograph your very first animal', goal: 1, rewardPoints: 10, group: 'any' },
  { id: 'birdwatcher', title: 'Birdwatcher', description: 'Photograph 3 different birds', goal: 3, rewardPoints: 25, group: 'bird' },
  { id: 'naturalist', title: 'Naturalist', description: 'Collect 5 different species', goal: 5, rewardPoints: 40, group: 'any' },
  { id: 'mammal-tracker', title: 'Mammal Tracker', description: 'Find 3 different mammals', goal: 3, rewardPoints: 25, group: 'mammal' },
];

// Progress is derived from the journal.
export function questProgress<S extends QuestSighting>(quest: Quest, sightings: S[], groupOf: GroupOf<S> = ownGroup): number {
  let species = distinctSpecies(sightings);
  if (quest.group && quest.group !== 'any') {
    species = species.filter((s) => groupOf(s) === quest.group);
  }
  return Math.min(species.length, quest.goal);
}

// Reward points for every completed big quest.
export function questRewardPoints<S extends QuestSighting>(sightings: S[], groupOf: GroupOf<S> = ownGroup): number {
  return SEED_QUESTS.filter((q) => questProgress(q, sightings, groupOf) >= q.goal).reduce((n, q) => n + q.rewardPoints, 0);
}

// When a quest was completed: the sighting that brought it to its goal.
export function questCompletedAt<S extends QuestSighting>(quest: Quest, sightings: S[], groupOf: GroupOf<S> = ownGroup): number | undefined {
  const sorted = [...sightings].sort((a, b) => a.observedAt - b.observedAt);
  for (let i = 1; i <= sorted.length; i++) {
    if (questProgress(quest, sorted.slice(0, i), groupOf) >= quest.goal) return sorted[i - 1].observedAt;
  }
  return undefined;
}

// ---------- Scout's weekly quests ----------
// Three per week (Monday to Sunday in the player's zone), picked from a pool
// with a seed so they're stable for a player, scored from the journal. No
// storage: rewards can be recomputed for any past week.
// (Named "challenges" in code; players see them as quests.)

// Small deterministic hash for seeded choices (FNV-1a).
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: string): () => number {
  let x = hash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

export interface ChallengeContext {
  week: QuestSighting[]; // counted sightings in the week
  before: QuestSighting[]; // counted sightings before the week
  // (Written as a method so a function that takes the app's richer Sighting fits.)
  groupOf(s: QuestSighting): string | undefined;
  zone?: Zone; // the player's calendar; the device's own when left out
}

export interface ChallengeDef {
  id: string;
  title: string;
  emoji: string;
  description: string;
  goal: number;
  reward: number;
  easy?: boolean;
  progress: (c: ChallengeContext) => number;
}

const speciesOf = (s: QuestSighting) => s.species?.scientificName || s.species?.commonName || '';
const distinct = (xs: QuestSighting[], f: (s: QuestSighting) => boolean = () => true) =>
  new Set(xs.filter(f).map(speciesOf).filter(Boolean)).size;

export const CHALLENGE_POOL: ChallengeDef[] = [
  {
    id: 'new_species',
    title: 'New to you',
    emoji: '✨',
    description: 'Find 2 animals that are new to you',
    goal: 2,
    reward: 20,
    progress: ({ week, before }) => {
      const seen = new Set(before.map(speciesOf));
      return new Set(week.map(speciesOf).filter((n) => n && !seen.has(n))).size;
    },
  },
  { id: 'birds', title: 'Feathers', emoji: '🐦', description: 'Snap 2 different birds', goal: 2, reward: 15, progress: ({ week, groupOf }) => distinct(week, (s) => groupOf(s) === 'bird') },
  { id: 'mammals', title: 'Fur & whiskers', emoji: '🦊', description: 'Snap 2 different mammals', goal: 2, reward: 15, progress: ({ week, groupOf }) => distinct(week, (s) => groupOf(s) === 'mammal') },
  {
    id: 'behavior',
    title: 'Caught in the act',
    emoji: '🎬',
    description: 'Catch an animal in action (flying, hunting, with babies…)',
    goal: 1,
    reward: 20,
    progress: ({ week }) => week.filter((s) => s.sceneTags.length > 0).length,
  },
  { id: 'days', title: 'Out and about', emoji: '📅', description: 'Go exploring on 3 different days', goal: 3, reward: 15, easy: true, progress: ({ week, zone }) => new Set(week.map((s) => (zone ?? localZone).dayKey(s.observedAt))).size },
  { id: 'busy', title: 'Busy week', emoji: '📸', description: 'Log 6 sightings', goal: 6, reward: 10, easy: true, progress: ({ week }) => week.length },
  { id: 'rare', title: 'Rare find', emoji: '💎', description: 'Find something rare', goal: 1, reward: 25, progress: ({ week }) => week.filter((s) => (s.score?.basePoints ?? 0) >= 5).length },
  {
    id: 'notes',
    title: 'Field notes',
    emoji: '📝',
    description: 'Add notes to 2 sightings',
    goal: 2,
    reward: 10,
    easy: true,
    progress: ({ week }) => week.filter((s) => s.science && Object.keys(s.science).length > 0).length,
  },
  {
    id: 'herps',
    title: 'Scales & slime',
    emoji: '🐸',
    description: 'Find a reptile or amphibian',
    goal: 1,
    reward: 25,
    progress: ({ week, groupOf }) => week.filter((s) => ['reptile', 'amphibian'].includes(groupOf(s) ?? '')).length,
  },
];

export const SWEEP_BONUS = 10; // all three done

// This week's three: one easy one plus two others, chosen by seed.
export function weeklyChallenges(weekStart: number, seed: string, zone: Zone = localZone): ChallengeDef[] {
  // The ':moss' suffix is historical; keep it so this week's quests don't change.
  const rand = seededRandom(`${seed}:${zone.dateString(weekStart)}:moss`);
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

export function challengeStatus<S extends QuestSighting>(weekStart: number, sightings: S[], seed: string, groupOf: GroupOf<S>, zone: Zone = localZone): ChallengeStatus[] {
  const end = zone.addWeeks(weekStart, 1);
  const group = groupOf as GroupOf;
  const counted = sightings.filter(COUNTED).sort((a, b) => a.observedAt - b.observedAt);
  const before = counted.filter((s) => s.observedAt < weekStart);
  const week = counted.filter((s) => s.observedAt >= weekStart && s.observedAt < end);
  return weeklyChallenges(weekStart, seed, zone).map((def) => {
    const progress = Math.min(def.progress({ week, before, groupOf: group, zone }), def.goal);
    let doneAt: number | undefined;
    if (progress >= def.goal) {
      // The first moment it was complete: replay the week sighting by sighting.
      for (let i = 1; i <= week.length; i++) {
        if (def.progress({ week: week.slice(0, i), before, groupOf: group, zone }) >= def.goal) {
          doneAt = week[i - 1].observedAt;
          break;
        }
      }
    }
    return { def, progress, done: progress >= def.goal, doneAt };
  });
}

// Points earned from weekly quests across every week with sightings.
export function challengeRewardPoints<S extends QuestSighting>(sightings: S[], seed: string, groupOf: GroupOf<S>, now = Date.now(), zone: Zone = localZone): number {
  const counted = sightings.filter(COUNTED);
  if (!counted.length) return 0;
  const weeks = new Set(counted.map((s) => zone.startOfWeek(s.observedAt)));
  let total = 0;
  for (const w of weeks) {
    if (w > now) continue;
    const status = challengeStatus(w, sightings, seed, groupOf, zone);
    total += status.filter((c) => c.done).reduce((n, c) => n + c.def.reward, 0);
    if (status.every((c) => c.done)) total += SWEEP_BONUS;
  }
  return total;
}

// ---------- the player's score ----------
// Sighting points plus completed big quests and weekly quests. This is the
// number on the leaderboard; the server computes it from the cloud journal
// with the same function the app uses to show it.
export function playerTotals<S extends QuestSighting>(
  sightings: S[],
  opts: { seed: string; zone?: Zone; groupOf?: GroupOf<S>; now?: number },
): { points: number; speciesCount: number; sightingPoints: number; questPoints: number } {
  const groupOf = opts.groupOf ?? (ownGroup as GroupOf<S>);
  const sightingPoints = totalPoints(sightings);
  const questPoints =
    questRewardPoints(sightings, groupOf) + challengeRewardPoints(sightings, opts.seed, groupOf, opts.now ?? Date.now(), opts.zone ?? localZone);
  return { points: sightingPoints + questPoints, speciesCount: distinctSpecies(sightings).length, sightingPoints, questPoints };
}
