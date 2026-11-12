import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearer, DAILY_LIMITS, dailyLimitReached, ownStorageUrl, rateLimited, safeEqual, secondsToUtcMidnight, SUPABASE_URL } from '../api/_lib/server';
import { modelFor, traitsOf } from '../api/_lib/claude';

test('the burst limit allows a burst, then says no', () => {
  const key = `test:${Math.random()}`;
  const results = Array.from({ length: 6 }, () => rateLimited(key, 5));
  assert.deepEqual(results, [false, false, false, false, false, true]);
  assert.equal(rateLimited(`other:${Math.random()}`, 5), false); // per key
});

test('secrets compare equal only when identical', () => {
  assert.equal(safeEqual('s3cret', 's3cret'), true);
  assert.equal(safeEqual('s3cret', 's3cret '), false);
  assert.equal(safeEqual('', 'x'), false);
  assert.equal(bearer('Bearer abc.def'), 'abc.def');
  assert.equal(bearer(['bearer tok']), 'tok');
  assert.equal(bearer('Basic abc'), null);
  assert.equal(bearer(undefined), null);
});

test('only links into our own storage are passed on', () => {
  const own = `${SUPABASE_URL}/storage/v1/object/public/feed-photos/uid/1.jpg`;
  assert.equal(ownStorageUrl(own, 'feed-photos'), own);
  assert.equal(ownStorageUrl(own, 'avatars'), null); // wrong bucket
  assert.equal(ownStorageUrl('https://evil.example/pixel.gif', 'feed-photos'), null);
  assert.equal(ownStorageUrl(`https://evil.example/?u=${own}`, 'feed-photos'), null);
  assert.equal(ownStorageUrl(null, 'feed-photos'), null);
});

test('the daily limit counts in the database and trips past the allowance', async () => {
  let count = DAILY_LIMITS.flag - 1;
  const db: any = { rpc: async (_fn: string, args: any) => ({ data: args.p_kind === 'flag' ? ++count : 1, error: null }) };
  assert.equal(await dailyLimitReached(db, 'u', 'flag'), false); // exactly at the allowance
  assert.equal(await dailyLimitReached(db, 'u', 'flag'), true); // one over
  assert.equal(await dailyLimitReached(db, 'u', 'identify'), false);
});

test('without a database (or before the migration) requests are allowed, not broken', async () => {
  assert.equal(await dailyLimitReached(null, 'u', 'identify'), false);
  const noTable: any = { rpc: async () => ({ data: null, error: { message: 'function public.bump_usage does not exist' } }) };
  assert.equal(await dailyLimitReached(noTable, 'u', 'identify'), false);
});

test('each job has a model, and each model is asked the way it accepts', () => {
  for (const job of ['identify', 'facts', 'forecast', 'story', 'photo_check'] as const) assert.match(modelFor(job), /^claude-/);
  assert.equal(modelFor('facts'), modelFor('story')); // Scout's writing shares one setting
  assert.equal(traitsOf('claude-haiku-5-5').fallback, undefined); // no server-side fallback on Haiku
  assert.equal(traitsOf('claude-haiku-5-5').effort, true);
  assert.equal(traitsOf('claude-sonnet-5-5').fallback?.fallbacks, 'default');
  assert.ok(traitsOf('claude-opus-5-5').fallback);
  assert.deepEqual(traitsOf('some-future-model'), {}); // unknown models get a plain request
});

test('a player over the daily allowance is told to come back after midnight UTC', () => {
  assert.equal(secondsToUtcMidnight(Date.parse('2026-11-12T21:00:00Z')), 3 * 3600);
  assert.equal(secondsToUtcMidnight(Date.parse('2026-11-12T00:00:00Z')), 86_400);
  assert.equal(secondsToUtcMidnight(Date.parse('2026-11-12T23:59:50Z')), 60); // never "retry at once"
});
