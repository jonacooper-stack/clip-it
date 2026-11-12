import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageFrom, bracketFor } from '../src/lib/age';

const now = new Date(2026, 10, 12); // 12 November 2026

test('a birthday earlier this year has happened; one later this year has not', () => {
  assert.equal(ageFrom(2013, 3, now), 13); // March 2013: already 13
  assert.equal(ageFrom(2013, 12, now), 12); // December 2013: still 12
  assert.equal(ageFrom(1990, 6, now), 36);
});

test('a birthday this month counts as not reached (the day is never asked)', () => {
  assert.equal(ageFrom(2013, 11, now), 12);
  assert.equal(ageFrom(2008, 11, now), 17);
});

test('nobody who is 12 is let in on the year alone', () => {
  // Everyone born in 2013 turns 13 during 2026, but only some have by November.
  const letIn = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => bracketFor(ageFrom(2013, m, now)) !== 'under_13');
  assert.deepEqual(letIn, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('age ranges: under 13, 13 to 17, adult', () => {
  assert.equal(bracketFor(12), 'under_13');
  assert.equal(bracketFor(13), '13_17');
  assert.equal(bracketFor(17), '13_17');
  assert.equal(bracketFor(18), 'adult');
  // Seventeen until the birthday month has passed.
  assert.equal(bracketFor(ageFrom(2008, 12, now)), '13_17');
  assert.equal(bracketFor(ageFrom(2008, 10, now)), 'adult');
});

test('January: last year\'s December birthdays have all happened', () => {
  const jan = new Date(2027, 0, 5);
  assert.equal(ageFrom(2013, 12, jan), 13);
  assert.equal(ageFrom(2014, 1, jan), 12); // this month: not yet
});
