// Kestrel, the Field Crew's rival, is the only crew member on the leaderboard.
// Pacing rules:
//   1. A steady weekly pace with day-to-day variation and rest days.
//   2. With enough active players, Kestrel tracks the community's 90th
//      percentile: speeds up (up to 2x) when well behind, pauses when well ahead.
//   3. Always overtakeable: once the top real player has 50+ points, Kestrel
//      stops gaining at 95% of that player's score, so the leader is always a
//      real person. Points never go down; when ahead, Kestrel waits to be passed.

export const KESTREL = {
  weeklyPace: 110,
  percentile: 0.9,
  capRatio: 0.95,
  seedPoints: 240,
  seedSpecies: 24,
};
export const MIN_ACTIVE_FOR_SCALING = 10;
export const OVERTAKE_MIN_POINTS = 50;
const REST_DAY_CHANCE = 0.22;

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
}

export function kestrelGain(
  current: number,
  ctx: { activePoints: number[]; topReal: number; rand: () => number },
): number {
  if (ctx.rand() < REST_DAY_CHANCE) return 0;
  let gain = (KESTREL.weeklyPace / 7) * (0.4 + ctx.rand() * 1.2);
  if (ctx.activePoints.length >= MIN_ACTIVE_FOR_SCALING) {
    const target = percentile(ctx.activePoints, KESTREL.percentile);
    if (current < target * 0.9) gain *= 2;
    else if (current > target * 1.15) gain = 0;
  }
  let next = current + Math.round(gain);
  if (ctx.topReal >= OVERTAKE_MIN_POINTS) {
    const cap = Math.floor(ctx.topReal * KESTREL.capRatio);
    if (next > cap) next = Math.max(current, cap);
  }
  return Math.max(0, next - current);
}
