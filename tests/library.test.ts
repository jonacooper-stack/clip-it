import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PHOTO_LIBRARY } from '../api/_lib/photoLibrary';
import { dailyPick, findLibraryPhoto, regionSpecies } from '../api/_lib/library';
import { REGION_KEYS } from '../shared/crew';
import { cleanName } from '../shared/moderation';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

test('every library photo has a file on the site, a credit and a usable name', () => {
  const slugs = new Set<string>();
  for (const p of PHOTO_LIBRARY) {
    assert.ok(existsSync(join(__dirname, '..', 'site', 'img', 'library', `${p.slug}.jpg`)), `missing site/img/library/${p.slug}.jpg`);
    assert.ok(p.credit.trim().length > 3, `${p.slug} has no credit`);
    assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`);
    slugs.add(p.slug);
    // Scout writes facts and stories about these names: they must pass the same check as names from the app.
    assert.ok(cleanName(p.species), `"${p.species}" would be refused as a name`);
    assert.ok(cleanName(p.sci, 80), `"${p.sci}" would be refused as a scientific name`);
  }
});

test('every region has animals to post about', () => {
  for (const region of REGION_KEYS) {
    assert.ok(regionSpecies(region).length >= 5, `${region} has too few species`);
    assert.ok(dailyPick(region, '2026-11-12'));
  }
});

test('the animal of the day is the same for everyone in a region, and does not repeat until all have had a turn', () => {
  assert.deepEqual(dailyPick('northeast', '2026-11-12'), dailyPick('northeast', '2026-11-12'));
  const count = new Set(PHOTO_LIBRARY.filter((p) => !p.region || ['northeast', 'east', 'north'].includes(p.region)).map((p) => p.species)).size;
  const run = Array.from({ length: count }, (_, i) => dailyPick('northeast', day(i)).species);
  assert.equal(new Set(run).size, count);
  assert.notEqual(dailyPick('northeast', day(0)).species, dailyPick('northeast', day(1)).species);
});

test('a library photo is found by scientific name first, then common name', () => {
  assert.equal(findLibraryPhoto('some other name', 'Vulpes vulpes')?.species, 'Red fox');
  assert.equal(findLibraryPhoto('red FOX')?.species, 'Red fox');
  assert.equal(findLibraryPhoto('Unicorn', 'Equus imaginarius'), null);
  assert.ok(findLibraryPhoto('Red fox', null, 2)?.url.startsWith('https://'));
});
