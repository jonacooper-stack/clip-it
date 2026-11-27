// Rarity tiers: how rare a sighting is, in five steps a player can learn at
// a glance. Worked out from the base (rarity) points of its score, which the
// server sets, so nothing new is stored or sent.
import type { FadeName } from '@/theme';
import { colors } from '@/theme';
import type { Sighting } from '@/types';

export interface Tier {
  key: 'backyard' | 'trail' | 'backcountry' | 'rare' | 'legendary';
  label: string;
  fade: FadeName;
  color: string; // for small marks where a fade would be lost
}

export const TIERS: Tier[] = [
  { key: 'backyard', label: 'Backyard', fade: 'stone', color: colors.faint },
  { key: 'trail', label: 'Trail', fade: 'meadow', color: colors.primary },
  { key: 'backcountry', label: 'Backcountry', fade: 'lagoon', color: colors.teal },
  { key: 'rare', label: 'Rare', fade: 'glacier', color: colors.sky },
  { key: 'legendary', label: 'Legendary', fade: 'goldenHour', color: colors.gold },
];

// Base points run from 1 (seen everywhere) to 21 (hardly ever seen).
export function tierForBase(basePoints: number | undefined): Tier {
  const b = typeof basePoints === 'number' && Number.isFinite(basePoints) ? basePoints : 0;
  if (b >= 16) return TIERS[4];
  if (b >= 10) return TIERS[3];
  if (b >= 6) return TIERS[2];
  if (b >= 3) return TIERS[1];
  return TIERS[0];
}

// A sighting's tier, or null when it has no score to go by (still being
// identified, or one from another device that carries no breakdown).
export function tierOf(s: Pick<Sighting, 'score'> | undefined | null): Tier | null {
  return s?.score && typeof s.score.basePoints === 'number' ? tierForBase(s.score.basePoints) : null;
}
