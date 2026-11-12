// Chile moves its clocks forward at midnight: Sunday 6 September 2026 has no
// 00:00. A streak that crosses that night must still count every day. (Each
// test file runs in its own process, so the time zone set here stays here.)
process.env.TZ = 'America/Santiago';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak } from '../src/lib/streak';
import type { Sighting } from '../src/types';

const on = (day: number, hour = 12): Sighting => {
  const d = new Date(2026, 8, day, hour, 0, 0).getTime();
  return { id: `s${day}`, createdAt: d, observedAt: d, sceneTags: [], idStatus: 'ai_confident', points: 3 };
};

test('a streak carries across a night when the clocks skip midnight', () => {
  assert.equal(new Date(2026, 8, 6, 0, 0, 0).getHours(), 1, 'this zone should have no midnight on 6 September 2026');
  const now = new Date(2026, 8, 8, 15, 0, 0).getTime();
  assert.equal(currentStreak([on(4), on(5), on(6), on(7), on(8)], now), 5);
  assert.equal(currentStreak([on(5), on(6), on(7)], now), 3); // nothing yet today
  assert.equal(currentStreak([on(4), on(6), on(7), on(8)], now), 3); // the 5th was missed
});
