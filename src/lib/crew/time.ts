// Week math for Scout (local time: weekly quests run Monday–Sunday in the
// player's own time zone).
import { localZone } from '../../../shared/zone';

export const DAY_MS = 86_400_000;

// Week and day keys come from the shared calendar code, read with the device
// clock (the server repeats them in the player's zone: shared/zone.ts).
export const startOfWeek = (t: number): number => localZone.startOfWeek(t);
export const addWeeks = (weekStart: number, n: number): number => localZone.addWeeks(weekStart, n);
export const dayKey = (t: number): string => localZone.dayKey(t);

export { hash, seededRandom } from '../../../shared/quests';

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Midnight (local) of a YYYY-MM-DD date.
export function localDateStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
