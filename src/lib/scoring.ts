// Client mirror of the server scoring engine
// (supabase/functions/_shared/scoring.ts). The SERVER is the source of truth;
// this exists so the offline mock identifier can produce the same numbers.
// Keep the constants in sync.

import type { ScoreBreakdown } from '@/types';
import { SCENE_TAGS } from './sceneTags';

export const RULE_VERSION = 'scoring-v1';

const RARITY_SCALE = 20;
const RARITY_GAMMA = 2;
const MAX_BASE_POINTS = 30;
const MAX_BEHAVIOR_MULTIPLIER = 8;
const MAX_TOTAL_POINTS = 500;
const FIRST_OF_SPECIES_BONUS = 5;
/** Bonus points per answered science question (client-side incentive). */
export const FIELD_NOTE_BONUS = 1;
/** Diminishing returns never drop a repeat below this fraction of its base value. */
const REPEAT_FLOOR = 0.1;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// Diminishing returns for re-photographing a species already in your journal:
// 1st = full, 2nd = 1/2, 3rd = 1/3 … floored so a repeat is always worth a little.
export function repeatFactor(priorSameSpecies: number): number {
  if (priorSameSpecies <= 0) return 1;
  return Math.max(1 / (priorSameSpecies + 1), REPEAT_FLOOR);
}

export function basePointsFromRarity(rarityScore: number): number {
  const r = clamp(rarityScore, 0, 1);
  const pts = 1 + RARITY_SCALE * Math.pow(r, RARITY_GAMMA);
  return clamp(Math.round(pts), 1, MAX_BASE_POINTS);
}

export function behaviorMultiplier(sceneTags: string[]): number {
  const m = sceneTags.reduce((acc, code) => acc * (SCENE_TAGS[code]?.multiplier ?? 1), 1);
  return clamp(m, 1, MAX_BEHAVIOR_MULTIPLIER);
}

export interface ScoreInput {
  rarityScore: number;
  sceneTags: string[];
  firstOfSpecies?: boolean;
  questBonus?: number;
  streakBonus?: number;
  /** How many counted captures of this species the player already has. */
  priorSameSpecies?: number;
  /** True when this exact photo was already submitted — earns nothing. */
  duplicatePhoto?: boolean;
}

export function scoreSighting(input: ScoreInput): ScoreBreakdown {
  const basePoints = basePointsFromRarity(input.rarityScore);
  const mult = behaviorMultiplier(input.sceneTags);
  const repeatMultiplier = input.duplicatePhoto ? 0 : repeatFactor(input.priorSameSpecies ?? 0);
  const subtotal = Math.round(basePoints * mult * repeatMultiplier);

  const bonuses = {
    firstOfSpecies: !input.duplicatePhoto && input.firstOfSpecies ? FIRST_OF_SPECIES_BONUS : 0,
    quest: input.duplicatePhoto ? 0 : Math.max(0, input.questBonus ?? 0),
    streak: input.duplicatePhoto ? 0 : Math.max(0, input.streakBonus ?? 0),
    fieldNotes: 0,
  };

  // An exact-duplicate photo earns nothing; any other eligible capture is worth >= 1.
  const totalPoints = input.duplicatePhoto
    ? 0
    : clamp(
        subtotal + bonuses.firstOfSpecies + bonuses.quest + bonuses.streak + bonuses.fieldNotes,
        1,
        MAX_TOTAL_POINTS,
      );

  return {
    basePoints,
    behaviorMultiplier: mult,
    repeatMultiplier,
    bonuses,
    totalPoints,
    ruleVersion: RULE_VERSION,
  };
}

// Re-derive a score with the field-notes bonus for `answeredCount` answered
// science questions. Recomputes the total from scratch so it's idempotent when a
// user toggles answers on and off.
export function applyFieldNotesBonus(
  score: ScoreBreakdown,
  answeredCount: number,
): { score: ScoreBreakdown; points: number } {
  const fieldNotes = Math.max(0, answeredCount) * FIELD_NOTE_BONUS;
  const repeat = score.repeatMultiplier ?? 1;
  const subtotal = Math.round(score.basePoints * score.behaviorMultiplier * repeat);
  const totalPoints =
    repeat === 0
      ? 0 // exact-duplicate photo stays at zero; field notes can't revive it
      : clamp(
          subtotal +
            score.bonuses.firstOfSpecies +
            score.bonuses.quest +
            score.bonuses.streak +
            fieldNotes,
          1,
          MAX_TOTAL_POINTS,
        );
  return {
    score: { ...score, bonuses: { ...score.bonuses, fieldNotes }, totalPoints },
    points: totalPoints,
  };
}
