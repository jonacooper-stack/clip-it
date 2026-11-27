import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankFor, RANKS } from '../src/lib/rank';

test('ranks follow the points, with the distance to the next one', () => {
  assert.equal(rankFor(0).rank.name, 'Tenderfoot');
  assert.deepEqual([rankFor(49).rank.name, rankFor(49).toNext], ['Tenderfoot', 1]);
  assert.equal(rankFor(50).rank.name, 'Pathfinder');
  const r = rankFor(173);
  assert.deepEqual([r.rank.name, r.next?.name, r.into, r.span, r.toNext], ['Trailblazer', 'Ranger', 23, 250, 227]);
});

test('the top rank has no next; odd numbers never break it', () => {
  const top = rankFor(999_999);
  assert.deepEqual([top.rank.name, top.next, top.toNext], [RANKS[RANKS.length - 1].name, null, 0]);
  assert.equal(rankFor(-5).rank.name, 'Tenderfoot');
  assert.equal(rankFor(NaN).rank.name, 'Tenderfoot');
});
