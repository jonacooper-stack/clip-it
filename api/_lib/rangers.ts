// ClipIt Rangers: clearly labeled bot accounts run by the ClipIt team (the app
// shows a BOT badge on every Ranger, and players can hide them). They post real,
// credited wildlife photos and pace the leaderboard so there's always someone
// to chase.
//
// Pacing rules (pure functions here so they can be tested; the daily job in
// api/rangers.ts applies them):
//   1. Four skill tiers, each with a steady weekly pace, natural day-to-day
//      variation, and rest days.
//   2. Once there are enough active players, each Ranger tracks a percentile of
//      the real community (25th / 50th / 75th / 90th): it speeds up (up to 2x)
//      when well behind its target and pauses when well ahead.
//   3. Always overtakeable: once the top real player has 50+ points, each
//      Ranger stops gaining at a share of that player's score (Pip 55%, Wren
//      75%, Ash 88%, Kestrel 95%), so the leader is always a real player and the
//      Rangers stay spread out below. Points never go down, so a Ranger that's
//      ahead simply waits to be passed.
//   4. Posting is separate from pacing: each Ranger shares a sighting on about
//      a quarter to a third of days (about one Ranger post a day in total, even
//      while paused), using photos it hasn't posted in the last 45 days.
//   Files under api/_lib are helpers, not endpoints (Vercel skips "_" paths).

export type Persona = 'backyard' | 'birds' | 'mammals' | 'raptors';

export interface RangerDef {
  key: string;
  name: string;
  email: string;
  tier: string;
  weeklyPace: number; // average points per week before community scaling
  percentile: number; // which slice of active real players this Ranger tracks
  capRatio: number; // never climbs above this share of the top real player's score
  seedPoints: number; // starting score, so the board isn't empty on day one
  seedSpecies: number;
  persona: Persona;
  postChance: number; // chance of sharing a post on a day it gains points
}

export const RANGERS: RangerDef[] = [
  { key: 'pip', name: 'Ranger Pip', email: 'ranger-pip@rangers.clipitwildlife.app', tier: 'Casual', weeklyPace: 25, percentile: 0.25, capRatio: 0.55, seedPoints: 35, seedSpecies: 6, persona: 'backyard', postChance: 0.25 },
  { key: 'wren', name: 'Ranger Wren', email: 'ranger-wren@rangers.clipitwildlife.app', tier: 'Regular', weeklyPace: 45, percentile: 0.5, capRatio: 0.75, seedPoints: 80, seedSpecies: 11, persona: 'birds', postChance: 0.3 },
  { key: 'ash', name: 'Ranger Ash', email: 'ranger-ash@rangers.clipitwildlife.app', tier: 'Keen', weeklyPace: 70, percentile: 0.75, capRatio: 0.88, seedPoints: 150, seedSpecies: 17, persona: 'mammals', postChance: 0.3 },
  { key: 'kestrel', name: 'Ranger Kestrel', email: 'ranger-kestrel@rangers.clipitwildlife.app', tier: 'Expert', weeklyPace: 110, percentile: 0.9, capRatio: 0.95, seedPoints: 240, seedSpecies: 24, persona: 'raptors', postChance: 0.3 },
];

export const MIN_ACTIVE_FOR_SCALING = 10;
export const OVERTAKE_MIN_POINTS = 50;
const REST_DAY_CHANCE = 0.22;

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const idx = Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))));
  return v[idx];
}

export interface PaceContext {
  activePoints: number[]; // totals of real players active in the last 30 days
  topReal: number; // highest real player's total
  rand: () => number;
}

// Points a Ranger gains today (never negative).
export function planGain(def: RangerDef, current: number, ctx: PaceContext): number {
  if (ctx.rand() < REST_DAY_CHANCE) return 0;
  let gain = (def.weeklyPace / 7) * (0.4 + ctx.rand() * 1.2);
  if (ctx.activePoints.length >= MIN_ACTIVE_FOR_SCALING) {
    const target = percentile(ctx.activePoints, def.percentile);
    if (current < target * 0.9) gain *= 2;
    else if (current > target * 1.15) gain = 0;
  }
  let next = current + Math.round(gain);
  if (ctx.topReal >= OVERTAKE_MIN_POINTS) {
    const cap = Math.floor(ctx.topReal * def.capRatio);
    if (next > cap) next = Math.max(current, cap);
  }
  return Math.max(0, next - current);
}

// ---- scoring (mirrors src/lib/scoring.ts) ----
const MULTIPLIERS: Record<string, number> = { with_young: 3, predation: 3, courtship: 2, in_flight: 1.5, group_herd: 1.5 };

export function photoPoints(rarity: number, tags: string[]): number {
  const r = Math.min(Math.max(rarity, 0), 1);
  const base = Math.min(Math.max(Math.round(1 + 20 * r * r), 1), 30);
  const mult = Math.min(Math.max(tags.reduce((m, t) => m * (MULTIPLIERS[t] ?? 1), 1), 1), 8);
  return Math.round(base * mult);
}

export interface LibraryPhoto {
  slug: string;
  species: string;
  sci: string;
  rarity: number;
  tags: string[];
  caption: string;
  credit: string;
  personas: Persona[];
}

// Pick a photo this Ranger hasn't posted yet, worth no more than today's gain.
// Prefers the Ranger's own persona; falls back to any unused photo.
export function pickPhoto(
  library: LibraryPhoto[],
  persona: Persona,
  maxPoints: number,
  used: Set<string>,
  rand: () => number,
): LibraryPhoto | null {
  const fits = library.filter((p) => !used.has(p.slug) && photoPoints(p.rarity, p.tags) <= maxPoints);
  const own = fits.filter((p) => p.personas.includes(persona));
  const pool = own.length ? own : fits;
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length)];
}
