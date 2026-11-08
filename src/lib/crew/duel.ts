// Kestrel's weekly duel: you vs Kestrel, most points Monday–Sunday wins.
// Kestrel's target is set from *your* recent weeks (around your average, give
// or take), so beating your typical week usually wins and a big week crushes it. Its score climbs through
// the week so there's always a live race. Pure functions, seeded per player.
import type { Sighting } from '@/types';
import { DAY_MS, addWeeks, seededRandom, startOfWeek } from './time';

export const DUEL_WIN_BONUS = 15;
const MIN_TARGET = 10;
const FIRST_WEEK_TARGET = 12; // no history yet: 2–3 sightings wins
const MAX_TARGET = 400;

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';

export function weekPoints(sightings: Sighting[], weekStart: number): number {
  const end = addWeeks(weekStart, 1);
  return sightings
    .filter((s) => COUNTED(s) && s.observedAt >= weekStart && s.observedAt < end)
    .reduce((n, s) => n + (s.points ?? 0), 0);
}

export function kestrelTarget(sightings: Sighting[], weekStart: number, seed: string): number {
  const prior = [1, 2, 3, 4].map((k) => weekPoints(sightings, addWeeks(weekStart, -k)));
  const active = prior.filter((p) => p > 0);
  const avg = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  const rand = seededRandom(`${seed}:${new Date(weekStart).toDateString()}:kestrel`);
  const jitter = 0.85 + rand() * 0.35; // 0.85–1.2
  const base = active.length ? avg * 0.9 + 2 : FIRST_WEEK_TARGET;
  return Math.round(Math.min(MAX_TARGET, Math.max(MIN_TARGET, base * jitter)));
}

// Kestrel's running total at time `t` within the week (an S-curve with a
// little noise, ending exactly at the target on Sunday night).
export function kestrelSoFar(target: number, weekStart: number, t: number, seed: string): number {
  const frac = Math.min(1, Math.max(0, (t - weekStart) / (7 * DAY_MS)));
  const day = Math.floor(frac * 7);
  const rand = seededRandom(`${seed}:${new Date(weekStart).toDateString()}:pace`);
  const wobble = Array.from({ length: 7 }, () => 0.85 + rand() * 0.3);
  const eased = frac * frac * (3 - 2 * frac);
  return frac >= 1 ? target : Math.round(target * Math.min(1, eased * (wobble[day] ?? 1)));
}

export interface DuelState {
  weekStart: number;
  you: number;
  kestrel: number; // so far
  target: number;
  finished: boolean;
  youWon?: boolean;
  daysLeft: number;
}

export function duelState(sightings: Sighting[], weekStart: number, seed: string, now = Date.now()): DuelState {
  const target = kestrelTarget(sightings, weekStart, seed);
  const end = addWeeks(weekStart, 1);
  const finished = now >= end;
  const you = weekPoints(sightings, weekStart);
  return {
    weekStart,
    you,
    kestrel: kestrelSoFar(target, weekStart, Math.min(now, end), seed),
    target,
    finished,
    youWon: finished ? you > target : undefined,
    daysLeft: finished ? 0 : Math.ceil((end - now) / DAY_MS),
  };
}

// Finished weeks the player actually played (a week with no sightings is a
// week off, not a loss).
export function duelHistory(sightings: Sighting[], seed: string, now = Date.now()): DuelState[] {
  const weeks = new Set(sightings.filter(COUNTED).map((s) => startOfWeek(s.observedAt)));
  return [...weeks]
    .sort((a, b) => a - b)
    .filter((w) => addWeeks(w, 1) <= now)
    .map((w) => duelState(sightings, w, seed, now));
}

export function duelRecord(sightings: Sighting[], seed: string, now = Date.now()) {
  const h = duelHistory(sightings, seed, now);
  return { wins: h.filter((d) => d.youWon).length, losses: h.filter((d) => !d.youWon).length };
}

export function duelBonusPoints(sightings: Sighting[], seed: string, now = Date.now()): number {
  return duelRecord(sightings, seed, now).wins * DUEL_WIN_BONUS;
}
