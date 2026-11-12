// The day streak: how many days in a row (in the player's own time zone) they
// logged at least one sighting that counted. Worked out from the journal
// rather than kept as a counter, so it can't drift: it's right after an app
// update, after offline captures are scored days later, and it drops to zero
// by itself when a day is missed.
import type { Sighting } from '@/types';

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';

function localDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function previousDay(day: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() - 1); // calendar math, so daylight-saving days work
  return d.getTime();
}

// Days are counted by when a sighting was logged in the app (createdAt), not
// when the photo was taken: importing last month's photos today counts for
// today only. The streak is still alive if the latest day is today or
// yesterday (today's outing may still be ahead).
export function currentStreak(sightings: Sighting[], now = Date.now()): number {
  const days = new Set(sightings.filter(COUNTED).map((s) => localDay(s.createdAt)));
  const today = localDay(now);
  let day = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}
