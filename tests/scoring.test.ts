import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldNotesBonus, basePointsFromRarity, behaviorMultiplier, repeatFactor, scoreSighting } from '../src/lib/scoring';

test('the canonical examples from docs/ARCHITECTURE.md', () => {
  // common deer = 1; deer + fawns = 3; fox eating a rabbit ≈ 6
  assert.equal(scoreSighting({ rarityScore: 0.1, sceneTags: [] }).totalPoints, 1);
  assert.equal(scoreSighting({ rarityScore: 0.1, sceneTags: ['with_young'] }).totalPoints, 3);
  assert.equal(scoreSighting({ rarityScore: 0.22, sceneTags: ['predation'] }).totalPoints, 6);
});

test('rarer animals are worth more, within the caps', () => {
  assert.equal(basePointsFromRarity(0), 1);
  assert.equal(basePointsFromRarity(1), 21);
  assert.equal(basePointsFromRarity(5), 21); // out-of-range input is clamped
  assert.equal(basePointsFromRarity(-1), 1);
  assert.ok(basePointsFromRarity(0.8) > basePointsFromRarity(0.4));
  assert.equal(behaviorMultiplier(['with_young', 'predation', 'courtship']), 8); // capped
  assert.equal(behaviorMultiplier(['made_up_tag']), 1); // unknown tags add nothing
});

test('first of a species earns a bonus; repeats earn less; an exact duplicate earns nothing', () => {
  assert.equal(scoreSighting({ rarityScore: 0.1, sceneTags: [], firstOfSpecies: true }).totalPoints, 6);
  assert.equal(repeatFactor(0), 1);
  assert.equal(repeatFactor(1), 0.5);
  assert.equal(repeatFactor(50), 0.1); // never below a tenth
  const again = scoreSighting({ rarityScore: 1, sceneTags: [], priorSameSpecies: 1 });
  assert.equal(again.totalPoints, 11); // half of 21, rounded
  const dup = scoreSighting({ rarityScore: 1, sceneTags: ['with_young'], firstOfSpecies: true, duplicatePhoto: true });
  assert.equal(dup.totalPoints, 0);
  assert.equal(scoreSighting({ rarityScore: 0, sceneTags: [], priorSameSpecies: 40 }).totalPoints, 1); // any real capture is worth at least 1
});

test('field notes add a point each and can be taken back off', () => {
  const base = scoreSighting({ rarityScore: 0.3, sceneTags: [] });
  const two = applyFieldNotesBonus(base, 2);
  assert.equal(two.points, base.totalPoints + 2);
  assert.equal(applyFieldNotesBonus(two.score, 0).points, base.totalPoints);
  const dup = scoreSighting({ rarityScore: 0.3, sceneTags: [], duplicatePhoto: true });
  assert.equal(applyFieldNotesBonus(dup, 3).points, 0); // notes can't revive a duplicate
});
