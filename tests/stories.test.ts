import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placePhotos, storyKey, storyPrompt, type StoryPage } from '../api/_lib/stories';
import type { PhotoRef } from '../api/_lib/library';
import { isNotAnimal } from '../api/_lib/crewFacts';

const pages = (n: number): StoryPage[] => Array.from({ length: n }, (_, i) => ({ heading: `Page ${i + 1}`, emoji: '🦊', text: 'Words.' }));
const photos = (n: number): PhotoRef[] => Array.from({ length: n }, (_, i) => ({ url: `https://x/${i}.jpg`, credit: 'c', species: 's' }));
const where = (ps: StoryPage[]) => ps.map((p, i) => (p.photo ? i : -1)).filter((i) => i >= 0);

test('photos start on the first page and spread out', () => {
  assert.deepEqual(where(placePhotos(pages(6), photos(3))), [0, 2, 4]);
  assert.deepEqual(where(placePhotos(pages(6), photos(1))), [0]);
  assert.deepEqual(where(placePhotos(pages(6), photos(6))), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(where(placePhotos(pages(6), photos(9))), [0, 1, 2, 3, 4, 5]); // more photos than pages
  assert.deepEqual(where(placePhotos(pages(6), [])), []);
  assert.equal(where(placePhotos(pages(7), photos(4))).length, 4);
});

test('placing photos never changes the stored story', () => {
  const original = pages(4);
  placePhotos(original, photos(2));
  assert.ok(original.every((p) => !p.photo));
});

test('a species story is shared by every region for the month; a theme story belongs to one region\'s week', () => {
  const nov = new Date('2026-11-12T00:00:00Z');
  const a = storyKey({ kind: 'species', species: 'Eastern gray squirrel', sci: 'Sciurus carolinensis', region: 'northeast' }, nov);
  const b = storyKey({ kind: 'species', species: 'Eastern Gray Squirrel', sci: 'Sciurus carolinensis', region: 'california' }, nov);
  assert.equal(a, b);
  assert.notEqual(a, storyKey({ kind: 'species', species: 'Eastern gray squirrel', sci: 'Sciurus carolinensis' }, new Date('2026-12-01T00:00:00Z')));
  const t1 = storyKey({ kind: 'theme', species: 'White-tailed deer', title: 'Deer are in the rut', region: 'northeast', weekOf: '2026-11-09' });
  const t2 = storyKey({ kind: 'theme', species: 'White-tailed deer', title: 'Deer are in the rut', region: 'midwest', weekOf: '2026-11-09' });
  assert.notEqual(t1, t2);
});

test('a species story (shared by all regions) is written without naming one', () => {
  const p = storyPrompt({ kind: 'species', species: 'Osprey', sci: 'Pandion haliaetus', region: 'northeast' }, new Date('2026-11-12T00:00:00Z'));
  assert.ok(p.includes('Osprey (Pandion haliaetus)'));
  assert.ok(p.includes('November'));
  assert.ok(!/northeast|New England/i.test(p));
  const t = storyPrompt({ kind: 'theme', species: 'Osprey', title: 'Ospreys head south', region: 'northeast', weekOf: '2026-11-09' }, new Date());
  assert.ok(/New England/.test(t) && t.includes('"Ospreys head south"') && t.includes('November 9'));
});

test('"not an animal" is remembered for a month, not forever', () => {
  const now = Date.parse('2026-11-12T00:00:00Z');
  const day = 86_400_000;
  assert.equal(isNotAnimal({ notAnimal: true, notAnimalAt: now - day }, now), true);
  assert.equal(isNotAnimal({ notAnimal: true, notAnimalAt: now - 31 * day }, now), false); // the model gets another look
  assert.equal(isNotAnimal({ notAnimal: true }, now), false);
  assert.equal(isNotAnimal({}, now), false);
  assert.equal(isNotAnimal(null, now), false);
});
