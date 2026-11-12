// The server repeats the phone's calendar maths in the player's time zone
// (shared/zone.ts). These tests check, for a spread of zones, that the
// named-zone version gives exactly what the device-clock version gives on a
// device set to that zone, including around every clock change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ianaZone, isTimeZone, localZone } from '../shared/zone';

const ZONES = [
  'UTC',
  'America/New_York',
  'Europe/London',
  'America/Santiago', // clocks go forward at midnight: some days have no 00:00
  'America/Havana', // clocks go back at 01:00 to 00:00: some days have two midnights
  'Asia/Kolkata', // +5:30, no clock changes
  'Australia/Lord_Howe', // half-hour clock changes
  'Pacific/Apia',
  'Pacific/Auckland',
];

const HOUR = 3600_000;
const FROM = Date.UTC(2025, 0, 1);
const TO = Date.UTC(2027, 11, 31);

// Every instant where the zone's offset from UTC changes in the range, found
// by walking it hour by hour.
function clockChanges(): number[] {
  const out: number[] = [];
  let last = new Date(FROM).getTimezoneOffset();
  for (let t = FROM; t <= TO; t += HOUR) {
    const off = new Date(t).getTimezoneOffset();
    if (off !== last) out.push(t);
    last = off;
  }
  return out;
}

for (const tz of ZONES) {
  test(`named zone ${tz} matches a device set to ${tz}`, () => {
    process.env.TZ = tz; // each test file is its own process; Node re-reads this when it changes
    const zone = ianaZone(tz);

    const samples: number[] = [];
    for (let t = FROM; t <= TO; t += 7 * HOUR + 1234_567) samples.push(t); // a spread of days and times
    for (const change of clockChanges()) {
      for (let dt = -50 * HOUR; dt <= 50 * HOUR; dt += HOUR / 2) samples.push(change + dt + 17); // around every clock change
    }

    for (const t of samples) {
      const at = new Date(t).toISOString();
      assert.equal(zone.dateString(t), new Date(t).toDateString(), `dateString at ${at}`);
      assert.equal(zone.dateString(t), localZone.dateString(t), `dateString at ${at}`);
      assert.equal(zone.dayKey(t), localZone.dayKey(t), `dayKey at ${at}`);
      assert.equal(zone.startOfDay(t), localZone.startOfDay(t), `startOfDay at ${at}`);
      assert.equal(zone.startOfWeek(t), localZone.startOfWeek(t), `startOfWeek at ${at}`);
      const week = localZone.startOfWeek(t);
      assert.equal(zone.addWeeks(week, 1), localZone.addWeeks(week, 1), `addWeeks +1 at ${at}`);
      assert.equal(zone.addWeeks(week, -3), localZone.addWeeks(week, -3), `addWeeks -3 at ${at}`);
    }
  });
}

test('a week starts on Monday, at the first instant of that day, whichever day you ask from', () => {
  process.env.TZ = 'America/Santiago';
  // Sunday 6 September 2026 has no midnight in Chile. Every day of that week
  // must still agree on when the week began (Monday 31 August, 00:00).
  const monday = new Date(2026, 7, 31, 0, 0, 0).getTime();
  for (let day = 31; day <= 37; day++) {
    for (const hour of [1, 9, 23]) {
      const t = new Date(2026, 7, day, hour, 30).getTime();
      assert.equal(localZone.startOfWeek(t), monday);
      assert.equal(ianaZone('America/Santiago').startOfWeek(t), monday);
    }
  }
  // And the day itself starts at 01:00, the first instant it has.
  const sunday = new Date(2026, 8, 6, 15).getTime();
  assert.equal(new Date(localZone.startOfDay(sunday)).getHours(), 1);
  assert.equal(ianaZone('America/Santiago').startOfDay(sunday), localZone.startOfDay(sunday));
});

test('unknown zone names are refused', () => {
  assert.equal(isTimeZone('Europe/Paris'), true);
  assert.equal(isTimeZone('Mars/Olympus_Mons'), false);
  assert.equal(isTimeZone(''), false);
  assert.equal(isTimeZone(null), false);
  assert.equal(isTimeZone('x'.repeat(200)), false);
  assert.throws(() => ianaZone('Mars/Olympus_Mons'));
});
