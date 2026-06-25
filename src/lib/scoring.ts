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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
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
}

export function scoreSighting(input: ScoreInput): ScoreBreakdown {
  const basePoints = basePointsFromRarity(input.rarityScore);
  const mult = behaviorMultiplier(input.sceneTags);
  const subtotal = Math.round(basePoints * mult);

  const bonuses = {
    firstOfSpecies: input.firstOfSpecies ? FIRST_OF_SPECIES_BONUS : 0,
    quest: Math.max(0, input.questBonus ?? 0),
    streak: Math.max(0, input.streakBonus ?? 0),
    fieldNotes: 0,
  };

  const totalPoints = clamp(
    subtotal + bonuses.firstOfSpecies + bonuses.quest + bonuses.streak + bonuses.fieldNotes,
    1,
    MAX_TOTAL_POINTS,
  );

  return {
    basePoints,
    behaviorMultiplier: mult,
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
  const subtotal = Math.round(score.basePoints * score.behaviorMultiplier);
  const totalPoints = clamp(
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
