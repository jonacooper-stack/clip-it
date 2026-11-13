import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speciesPhotoLookup, libraryPhotos, type LookupDeps } from '../api/_lib/photos';
import { photoKey } from '../api/_lib/photoFlags';
import type { PhotoRef } from '../api/_lib/library';

const commons = (n: number): PhotoRef => ({
  url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${n}/Photo_${n}.jpg/1280px-Photo_${n}.jpg`,
  credit: `Someone ${n} · CC BY 4.0`,
  species: `Photo ${n}.jpg`,
  source: `https://commons.wikimedia.org/wiki/File:Photo_${n}.jpg`,
});

// A fake outside world that records what the lookup asked of it.
function world(found: PhotoRef[], accept: (p: PhotoRef) => boolean = () => true) {
  const calls = { searches: 0, verified: [] as string[] };
  const deps: LookupDeps = {
    search: async () => {
      calls.searches++;
      return found;
    },
    verify: async (_species, _sci, candidates) => {
      calls.verified.push(...candidates.map((c) => c.url));
      return { ok: candidates.filter(accept), judged: candidates };
    },
    blocked: async () => new Set<string>(),
    remember: async () => {},
  };
  return { deps, calls };
}

test('library photos come first, and a full set needs no search at all', async () => {
  const lib = libraryPhotos('Red fox', 'Vulpes vulpes');
  assert.ok(lib.length >= 3, 'the library has several red fox photos');
  const { deps, calls } = world([commons(1)]);
  const r = await speciesPhotoLookup('Red fox', 'Vulpes vulpes', 3, {}, deps);
  assert.equal(r.photos.length, 3);
  assert.equal(calls.searches, 0);
  assert.equal(calls.verified.length, 0);
});

test('for an animal we have no photos of, candidates are checked and the good ones kept', async () => {
  const found = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(commons);
  const { deps, calls } = world(found, (p) => !p.url.includes('Photo_2')); // one is turned down
  const r = await speciesPhotoLookup('Mountain bluebird', 'Sialia currucoides', 5, {}, deps);
  assert.equal(r.failed, false);
  assert.equal(r.photos.length, 5);
  assert.ok(!r.photos.some((p) => p.url.includes('Photo_2')));
  assert.equal(calls.verified.length, 8); // 5 wanted + 3 spare, never the whole search result
  assert.equal(r.checked.length, 8); // kept and turned down alike are remembered
  assert.ok(r.photos.every((p) => p.species === 'Mountain bluebird'));
});

test('a later lookup never re-checks a photo it has judged before', async () => {
  const found = [1, 2, 3].map(commons);
  const first = world(found, (p) => p.url.includes('Photo_1')); // only one is good
  const a = await speciesPhotoLookup('Mountain bluebird', null, 5, {}, first.deps);
  assert.equal(a.photos.length, 1);
  assert.equal(first.calls.verified.length, 3);

  // Three days later: the same search results, plus one new upload.
  const second = world([...found, commons(4)]);
  const b = await speciesPhotoLookup('Mountain bluebird', null, 5, { accepted: a.photos, checked: a.checked }, second.deps);
  assert.deepEqual(second.calls.verified, [commons(4).url]); // only the new one costs anything
  assert.equal(b.photos.length, 2);
  assert.equal(b.photos[0].url, commons(1).url); // the one accepted before is kept, unchecked
  assert.equal(b.checked.length, 4);

  // And again with nothing new: no check at all.
  const third = world([...found, commons(4)]);
  const c = await speciesPhotoLookup('Mountain bluebird', null, 5, { accepted: b.photos, checked: b.checked }, third.deps);
  assert.equal(third.calls.verified.length, 0);
  assert.equal(c.photos.length, 2);
});

test('reported photos are dropped, even ones accepted earlier', async () => {
  const { deps } = world([]);
  deps.blocked = async (refs) => new Set(refs.filter((r) => r.url.includes('Photo_1')).map((r) => photoKey(r.url)));
  const r = await speciesPhotoLookup('Mountain bluebird', null, 5, { accepted: [commons(1), commons(2)], checked: [] }, deps);
  assert.deepEqual(r.photos.map((p) => p.url), [commons(2).url]);
});

test('if the search or the check fails, what we already had is kept and a retry is signalled', async () => {
  const { deps } = world([]);
  deps.search = async () => {
    throw new Error('commons 503');
  };
  const r = await speciesPhotoLookup('Mountain bluebird', null, 5, { accepted: [commons(1)], checked: ['x'] }, deps);
  assert.equal(r.failed, true);
  assert.equal(r.photos.length, 1);
  assert.deepEqual(r.checked, ['x']);
});

test('one image has one key, whatever size or host it is served at', () => {
  const a = photoKey('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Red_Fox.jpg/1280px-Red_Fox.jpg');
  const b = photoKey('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Red_Fox.jpg/960px-Red_Fox.jpg');
  const c = photoKey('https://upload.wikimedia.org/wikipedia/commons/a/ab/Red_Fox.jpg');
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(photoKey('http://clipitwildlife.app/img/library/squirrel.jpg?x=1'), 'https://clipitwildlife.app/img/library/squirrel.jpg');
});
