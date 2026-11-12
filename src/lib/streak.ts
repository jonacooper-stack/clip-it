// The day streak: how many days in a row (in the player's own time zone) they
// logged at least one sighting that counted. Worked out from the journal
// rather than kept as a counter, so it can't drift: it's right after an app
// update, after offline captures are scored days later, and it drops to zero
// by itself when a day is missed.
import type { Sighting } from '@/types';

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';

// A calendar day in the player's time zone, as a number like 20261112.
// (Not a midnight timestamp: where daylight saving starts at midnight, that
// day has no midnight, and days stop lining up.)
function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Days are counted by when a sighting was logged in the app (createdAt), not
// when the photo was taken: importing last month's photos today counts for
// today only. The streak is still alive if the latest day is today or
// yesterday (today's outing may still be ahead).
export function currentStreak(sightings: Sighting[], now = Date.now()): number {
  const days = new Set(sightings.filter(COUNTED).map((s) => dayKey(new Date(s.createdAt))));
  // Walk back a calendar day at a time, from noon (noon exists every day).
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  const back = () => day.setDate(day.getDate() - 1);
  if (!days.has(dayKey(day))) back();
  let streak = 0;
  while (days.has(dayKey(day))) {
    streak++;
    back();
  }
  return streak;
}
