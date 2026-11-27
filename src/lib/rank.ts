// Explorer ranks: what a player's points add up to. Worked out from the
// score; nothing is stored. (Plain functions: see tests/rank.test.ts.)

export interface Rank {
  name: string;
  /** Points at which this rank starts. */
  from: number;
}

export const RANKS: Rank[] = [
  { name: 'Tenderfoot', from: 0 },
  { name: 'Pathfinder', from: 50 },
  { name: 'Trailblazer', from: 150 },
  { name: 'Ranger', from: 400 },
  { name: 'Wayfinder', from: 1000 },
  { name: 'Legend', from: 2500 },
];

export interface RankProgress {
  rank: Rank;
  next: Rank | null;
  /** Points earned since this rank began, and how many the rank spans. */
  into: number;
  span: number;
  toNext: number;
}

export function rankFor(points: number): RankProgress {
  const p = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  let i = 0;
  while (i + 1 < RANKS.length && p >= RANKS[i + 1].from) i++;
  const rank = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  return { rank, next, into: p - rank.from, span: next ? next.from - rank.from : 0, toNext: next ? next.from - p : 0 };
}
