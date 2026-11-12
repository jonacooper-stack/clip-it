import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak } from '../src/lib/streak';
import type { Sighting } from '../src/types';

const DAY = 86_400_000;
// "Now" is 3pm local time on a fixed day; tests run in whatever zone the machine is in.
const now = new Date(2026, 10, 12, 15, 0, 0).getTime();
const at = (daysAgo: number, hour = 12, extra: Partial<Sighting> = {}): Sighting => {
  const d = new Date(2026, 10, 12 - daysAgo, hour, 0, 0).getTime();
  return { id: `s${daysAgo}-${hour}`, createdAt: d, observedAt: d, sceneTags: [], idStatus: 'ai_confident', points: 3, ...extra };
};

test('no sightings, no streak', () => {
  assert.equal(currentStreak([], now), 0);
});

test('consecutive local days count, most recent first', () => {
  assert.equal(currentStreak([at(0)], now), 1);
  assert.equal(currentStreak([at(0), at(1), at(2)], now), 3);
  assert.equal(currentStreak([at(0, 9), at(0, 14), at(1)], now), 2); // two on one day count once
});

test('a missed day ends the streak', () => {
  assert.equal(currentStreak([at(0), at(1), at(3), at(4)], now), 2);
  assert.equal(currentStreak([at(2), at(3)], now), 0); // nothing today or yesterday
});

test('the streak survives until the end of the next day', () => {
  assert.equal(currentStreak([at(1), at(2)], now), 2); // nothing logged yet today
});

test('late-evening and early-morning captures are neighbouring local days (the old UTC rule got this wrong)', () => {
  assert.equal(currentStreak([at(0, 1), at(1, 23)], now), 2);
});

test('photos that did not count do not keep a streak alive', () => {
  assert.equal(currentStreak([at(0, 12, { idStatus: 'rejected', points: undefined }), at(1)], now), 1);
  assert.equal(currentStreak([at(0, 12, { idStatus: 'ineligible' }), at(1)], now), 1);
  assert.equal(currentStreak([at(0, 12, { idStatus: 'queued', points: undefined })], now), 0); // not scored yet
});

test('days are counted by when a sighting was logged, not when the photo was taken', () => {
  const imported = at(0, 10, { observedAt: now - 30 * DAY }); // an old photo uploaded today
  assert.equal(currentStreak([imported], now), 1);
});
