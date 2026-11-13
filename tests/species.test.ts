// One way of writing a species (shared/species.ts): the identifier doesn't
// always write a name the same way, and the game must count it once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSpecies, sameSpecies, speciesKey } from '../shared/species';

test('subspecies, capitals, notes and qualifiers all come down to genus and species', () => {
  const cases: [string, string][] = [
    ['Vulpes vulpes', 'Vulpes vulpes'],
    ['Vulpes Vulpes', 'Vulpes vulpes'],
    ['vulpes vulpes', 'Vulpes vulpes'],
    ['Vulpes vulpes fulva', 'Vulpes vulpes'],
    ['Vulpes vulpes (juvenile)', 'Vulpes vulpes'],
    ['  Canis lupus baileyi ', 'Canis lupus'],
    ['Larus sp.', 'Larus'],
    ['Larus cf. argentatus', 'Larus argentatus'],
    ['Anas platyrhynchos × Anas rubripes', 'Anas platyrhynchos'],
    ['Passer domesticus, female', 'Passer domesticus'],
  ];
  for (const [raw, want] of cases) assert.equal(canonicalSpecies(raw), want, raw);
});

test('text that is not a name is left alone (trimmed); nothing is not a species', () => {
  assert.equal(canonicalSpecies('  ??? '), '???');
  assert.equal(canonicalSpecies(42), '');
  assert.equal(sameSpecies('', ''), false);
  assert.equal(sameSpecies('Vulpes vulpes fulva', 'VULPES VULPES'), true);
  assert.equal(sameSpecies('Vulpes vulpes', 'Vulpes lagopus'), false);
  assert.equal(speciesKey('Vulpes Vulpes'), 'vulpes vulpes');
});
