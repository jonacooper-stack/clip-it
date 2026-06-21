// Clip-It — scoring engine (server-side, pure logic).
//
// Points are DERIVED, never hand-assigned per species:
//
//   base points   = f(species rarity score)            common -> low, rare -> high
//   x behavior    = product of matched scene-tag multipliers (capped)
//   + bonuses      = first-of-species + active quest + streak
//   = total        (clamped)
//
// Canonical targets (see docs/ARCHITECTURE.md):
//   common deer            -> 1
//   deer + fawns           -> 3   (with_young x3)
//   fox eating a rabbit    -> 6   (fox base 2 x predation x3)
//
// This module is pure and dependency-free so it runs unchanged in a Supabase
// Edge Function (Deno) and is trivially unit-testable.

export const RULE_VERSION = "scoring-v1";

// Tunable global knobs — the ONLY hand-set numbers. No per-species tuning.
const RARITY_SCALE = 20; // how steeply rarity raises base points
const RARITY_GAMMA = 2; // curve shape (rarer animals climb faster)
const MAX_BASE_POINTS = 30;
const MAX_BEHAVIOR_MULTIPLIER = 8;
const MAX_TOTAL_POINTS = 500;

const FIRST_OF_SPECIES_BONUS = 5;

export interface SceneTag {
  code: string;
  multiplier: number;
  requiresReview?: boolean;
}

export interface ScoreInput {
  /** Species rarity in [0,1]: 0 = extremely common, 1 = extremely rare. */
  rarityScore: number;
  /** Optional region-specific rarity; when present it overrides the national score. */
  regionRarityScore?: number | null;
  /** Behavior/scene tags matched against the controlled vocabulary. */
  sceneTags?: SceneTag[];
  /** True if this is the player's first time logging this species. */
  firstOfSpecies?: boolean;
  /** Flat bonus from an active quest, if any. */
  questBonus?: number;
  /** Flat bonus from the player's current streak, if any. */
  streakBonus?: number;
}

export interface ScoreBreakdown {
  basePoints: number;
  rarityComponent: number;
  behaviorMultiplier: number;
  bonuses: {
    firstOfSpecies: number;
    quest: number;
    streak: number;
  };
  totalPoints: number;
  ruleVersion: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Map a rarity score in [0,1] to base points. Common animals floor at 1. */
export function basePointsFromRarity(rarityScore: number): number {
  const r = clamp(rarityScore, 0, 1);
  const pts = 1 + RARITY_SCALE * Math.pow(r, RARITY_GAMMA);
  return clamp(Math.round(pts), 1, MAX_BASE_POINTS);
}

/** Product of matched scene-tag multipliers, capped so a stack can't explode. */
export function behaviorMultiplier(sceneTags: SceneTag[] = []): number {
  const m = sceneTags.reduce((acc, t) => acc * (t.multiplier ?? 1), 1);
  return clamp(m, 1, MAX_BEHAVIOR_MULTIPLIER);
}

/** Compute the full, auditable point breakdown for a sighting. */
export function scoreSighting(input: ScoreInput): ScoreBreakdown {
  const effectiveRarity =
    input.regionRarityScore != null ? input.regionRarityScore : input.rarityScore;

  const basePoints = basePointsFromRarity(effectiveRarity);
  const mult = behaviorMultiplier(input.sceneTags);
  const subtotal = Math.round(basePoints * mult);

  const bonuses = {
    firstOfSpecies: input.firstOfSpecies ? FIRST_OF_SPECIES_BONUS : 0,
    quest: Math.max(0, input.questBonus ?? 0),
    streak: Math.max(0, input.streakBonus ?? 0),
  };

  const totalPoints = clamp(
    subtotal + bonuses.firstOfSpecies + bonuses.quest + bonuses.streak,
    1,
    MAX_TOTAL_POINTS,
  );

  return {
    basePoints,
    rarityComponent: effectiveRarity,
    behaviorMultiplier: mult,
    bonuses,
    totalPoints,
    ruleVersion: RULE_VERSION,
  };
}

/** A high-drama tag (e.g. predation) means we want a quick human glance. */
export function needsReviewForTags(sceneTags: SceneTag[] = []): boolean {
  return sceneTags.some((t) => t.requiresReview === true);
}
