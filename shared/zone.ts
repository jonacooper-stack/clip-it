// Calendar maths in a named time zone.
//
// Weekly quests run Monday to Sunday in the player's own time zone, and the
// phone has always worked that out with the device clock. The server keeps
// the score now, so it has to be able to repeat the same sums for a player
// in any zone: `ianaZone('America/New_York')` gives the same answers there as
// `localZone` gives on a phone set to New York, including on days when the
// clocks skip or repeat an hour.
//
// Keep this file free of React Native and Node-only imports.

export interface Zone {
  /** The first instant of the calendar day that contains `t`. */
  startOfDay(t: number): number;
  /** The first instant of the Monday of the week that contains `t`. */
  startOfWeek(t: number): number;
  /** The same time of day, `n` weeks later. */
  addWeeks(weekStart: number, n: number): number;
  /** A key for the calendar day of `t` (year-month-day, months counted from 0). */
  dayKey(t: number): string;
  /** The day of `t` written like "Mon Nov 09 2026" (what Date#toDateString gives). */
  dateString(t: number): string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

// The clock-and-calendar reading of an instant somewhere.
interface Wall {
  y: number;
  m: number; // 0–11
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
  dow: number; // 0 = Sunday
}

// Everything is derived from two operations: read the wall clock at an
// instant, and find the instant for a wall-clock reading.
function makeZone(wallAt: (t: number) => Wall, instantAt: (y: number, m: number, d: number, h: number, mi: number, s: number, ms: number) => number): Zone {
  const mondayOffset = (w: Wall) => (w.dow + 6) % 7; // days since Monday
  return {
    startOfDay(t) {
      const w = wallAt(t);
      return instantAt(w.y, w.m, w.d, 0, 0, 0, 0);
    },
    startOfWeek(t) {
      const w = wallAt(t);
      return instantAt(w.y, w.m, w.d - mondayOffset(w), 0, 0, 0, 0);
    },
    addWeeks(weekStart, n) {
      const w = wallAt(weekStart);
      return instantAt(w.y, w.m, w.d + 7 * n, w.h, w.mi, w.s, w.ms);
    },
    dayKey(t) {
      const w = wallAt(t);
      return `${w.y}-${w.m}-${w.d}`;
    },
    dateString(t) {
      const w = wallAt(t);
      return `${WEEKDAYS[w.dow]} ${MONTHS[w.m]} ${pad2(w.d)} ${w.y}`;
    },
  };
}

// The device's own zone, read through Date (what the app has always used).
export const localZone: Zone = makeZone(
  (t) => {
    const d = new Date(t);
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(), dow: d.getDay() };
  },
  (y, m, d, h, mi, s, ms) => new Date(y, m, d, h, mi, s, ms).getTime(),
);

// Whether `tz` is a time zone this JavaScript engine knows ("Europe/Paris").
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The engine's own spelling of a zone name ("asia/calcutta" -> "Asia/Calcutta"),
// or null if it doesn't know it. Use this before storing or caching a name a
// caller supplied: many spellings are accepted for the same zone.
export function canonicalTimeZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const zones = new Map<string, Zone>();

// Any named zone, read through Intl. Throws on a name the engine doesn't know
// (check with isTimeZone first).
export function ianaZone(tz: string): Zone {
  const cached = zones.get(tz);
  if (cached) return cached;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });

  const wallAt = (t: number): Wall => {
    const p: Record<string, string> = {};
    for (const part of fmt.formatToParts(new Date(t))) p[part.type] = part.value;
    return {
      y: Number(p.year),
      m: Number(p.month) - 1,
      d: Number(p.day),
      h: Number(p.hour) % 24,
      mi: Number(p.minute),
      s: Number(p.second),
      ms: ((t % 1000) + 1000) % 1000,
      dow: WEEKDAYS.indexOf(p.weekday),
    };
  };

  // How far the zone's clock is ahead of UTC at an instant, in milliseconds.
  const offsetAt = (t: number): number => {
    const w = wallAt(t);
    return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s, w.ms) - t;
  };

  // The instant at which the zone's clock shows this reading. The same rules
  // as JavaScript's own Date: a reading that happens twice (clocks going
  // back) means the first time; one that never happens (clocks going
  // forward) is read with the offset from before the change, which lands
  // just after the skipped stretch.
  const instantAt = (y: number, m: number, d: number, h: number, mi: number, s: number, ms: number): number => {
    const wall = Date.UTC(y, m, d, h, mi, s, ms); // the reading, as if the zone were UTC
    const before = offsetAt(wall - 86_400_000);
    const after = offsetAt(wall + 86_400_000);
    const candidates = [wall - before, wall - after].filter((t) => offsetAt(t) === wall - t);
    return candidates.length ? Math.min(...candidates) : wall - before;
  };

  const zone = makeZone(wallAt, instantAt);
  if (zones.size > 600) zones.clear(); // there are only a few hundred real zones
  zones.set(tz, zone);
  return zone;
}
