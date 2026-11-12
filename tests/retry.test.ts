import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueForRetry, MAX_AUTO_RETRIES, nextRetry, RETRY_WAITS_MS } from '../src/lib/retry';

test('waits grow with each failed try, then hold at the longest', () => {
  const waits = [1, 2, 3, 4, 5, 6, 20].map((n) => nextRetry(n, 0).nextAt);
  assert.deepEqual(waits, [30_000, 120_000, 600_000, 3_600_000, 21_600_000, 21_600_000, 21_600_000]);
  assert.equal(nextRetry(0, 0).nextAt, RETRY_WAITS_MS[0]); // never an invalid wait
  assert.equal(nextRetry(3, 1000).attempts, 3);
});

test('a capture is due when it has never failed, or its wait is over', () => {
  assert.equal(dueForRetry(undefined, 0), true);
  assert.equal(dueForRetry({ attempts: 1, nextAt: 5000 }, 4999), false);
  assert.equal(dueForRetry({ attempts: 1, nextAt: 5000 }, 5000), true);
});

test('after the last automatic try it is left for the player to retry', () => {
  assert.equal(dueForRetry({ attempts: MAX_AUTO_RETRIES, nextAt: 0 }, Date.now()), false);
  assert.equal(dueForRetry({ attempts: MAX_AUTO_RETRIES - 1, nextAt: 0 }, Date.now()), true);
});

test('a capture that always fails costs at most a handful of tries a day', () => {
  // Total wait across all automatic tries is over a day.
  let t = 0;
  for (let n = 1; n <= MAX_AUTO_RETRIES; n++) t = nextRetry(n, t).nextAt;
  assert.ok(t > 24 * 3600_000, `only ${t / 3600_000}h`);
});
