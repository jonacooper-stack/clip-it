// When an account counts as "created just now, in this version of the app"
// (src/lib/newAccount.ts): only then is its journal saved without asking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createdHere } from '../src/lib/newAccount';
import { ageIsSettled } from '../shared/age';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

test('an account made a moment ago, after sign-up was started here, is new here', () => {
  assert.equal(createdHere(ago(30_000), NOW - 2 * MIN, NOW), true);
  assert.equal(createdHere(ago(5 * MIN), NOW - 6 * MIN, NOW), true);
});

test('anything else is not: it is asked before its journal is saved', () => {
  // an existing account signing in (also through Google or Apple)
  assert.equal(createdHere(ago(40 * 24 * 60 * MIN), NOW - MIN, NOW), false);
  // a brand-new account, but nobody started a sign-up in this version (it was made in the version the app shipped with)
  assert.equal(createdHere(ago(3 * MIN), null, NOW), false);
  // a sign-up was started here long ago; the account was made elsewhere just now
  assert.equal(createdHere(ago(MIN), NOW - 3 * 60 * MIN, NOW), false);
  // the account is older than the sign-up that was started here
  assert.equal(createdHere(ago(10 * MIN), NOW - 2 * MIN, NOW), false);
  // unknown or odd values
  for (const [created, started] of [[undefined, NOW], [null, NOW], ['not a date', NOW], [ago(MIN), NaN], [ago(MIN), NOW + 5 * MIN]] as [string | null | undefined, number][]) {
    assert.equal(createdHere(created, started, NOW), false);
  }
});

test('the age question is settled by an adult answer, or a 13–17 answer that included the month', () => {
  assert.equal(ageIsSettled('adult', null), true);
  assert.equal(ageIsSettled('adult', 1), true);
  assert.equal(ageIsSettled('13_17', 2), true);
  assert.equal(ageIsSettled('13_17', 3), true);
  for (const [bracket, check] of [['13_17', null], ['13_17', 1], ['13_17', undefined], ['13_17', '2'], ['under_13', 2], [null, 2], [undefined, undefined], ['', 2]] as [unknown, unknown][]) {
    assert.equal(ageIsSettled(bracket, check), false);
  }
});
