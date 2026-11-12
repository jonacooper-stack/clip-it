import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { COPY_BITS, differenceHash, hamming, informative, mirrorHash, PHASH_BITS, photoFingerprint, RESAVE_BITS, samePhoto } from '../api/_lib/phash';
import { LIBRARY_HASHES } from '../api/_lib/libraryHashes';
import { libraryHashes } from '../scripts/hash-library';

const DIR = join(__dirname, '..', 'site', 'img', 'library');
const files = readdirSync(DIR).filter((f) => f.endsWith('.jpg')).sort();
const load = (f: string) => readFileSync(join(DIR, f));

type Image = { data: Uint8Array; width: number; height: number };
const decode = (b: Buffer): Image => jpeg.decode(b, { useTArray: true });
function resize(img: Image, w: number): Image {
  const h = Math.round((img.height * w) / img.width);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.floor((x * img.width) / w), sy = Math.floor((y * img.height) / h);
    out.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4);
  }
  return { data: out, width: w, height: h };
}
const resave = (img: Image, quality: number) => jpeg.encode(img as any, quality).data.toString('base64');

test('the library fingerprints file is up to date (run: npx tsx scripts/hash-library.ts)', () => {
  assert.deepEqual(LIBRARY_HASHES, libraryHashes());
  assert.equal(Object.keys(LIBRARY_HASHES).length, files.length);
});

test('a fingerprint is 256 bits, and the same bytes always give the same one', () => {
  const b64 = load(files[0]).toString('base64');
  const a = photoFingerprint(b64);
  assert.match(a.sha, /^[0-9a-f]{64}$/);
  assert.match(a.phash!, /^[0-9a-f]{64}$/);
  assert.equal(PHASH_BITS, 256);
  assert.deepEqual(photoFingerprint(b64), a);
  assert.equal(hamming(a.phash, a.phash), 0);
});

test('different photos are far apart: no two library photos come near "the same picture"', () => {
  const hashes = Object.values(LIBRARY_HASHES);
  let closest = PHASH_BITS;
  for (let i = 0; i < hashes.length; i++) for (let j = i + 1; j < hashes.length; j++) closest = Math.min(closest, hamming(hashes[i], hashes[j]));
  assert.ok(closest > 3 * COPY_BITS, `closest pair of different photos is ${closest} bits apart`);
});

test('a resized, re-saved copy is recognised as a copy', () => {
  let caught = 0;
  const sample = files.filter((_, i) => i % 5 === 0); // 20 photos
  for (const f of sample) {
    const original = photoFingerprint(load(f).toString('base64'));
    const copy = photoFingerprint(resave(resize(decode(load(f)), 1024), 55));
    assert.notEqual(copy.sha, original.sha); // different bytes…
    if (samePhoto(copy, original, COPY_BITS)) caught++; // …same picture
    assert.ok(hamming(copy.phash, original.phash) < 45, `${f}: ${hamming(copy.phash, original.phash)} bits`);
  }
  assert.ok(caught >= sample.length - 1, `caught ${caught} of ${sample.length} copies`);
});

test('within a player\'s own journal only the very same picture counts as a duplicate', () => {
  const a = photoFingerprint(load(files[3]).toString('base64'));
  assert.equal(samePhoto(a, { sha: a.sha, phash: null }, RESAVE_BITS), true); // same bytes
  assert.equal(samePhoto(a, { sha: 'x', phash: a.phash }, RESAVE_BITS), true); // same picture, new bytes
  // Flip 10 bits: close enough to be a copy of someone else's photo, not close enough to zero a player's own burst shot.
  const flipped = a.phash!.split('').map((c, i) => (i < 10 ? ((parseInt(c, 16) ^ 1) & 15).toString(16) : c)).join('');
  assert.equal(hamming(a.phash, flipped), 10);
  assert.equal(samePhoto(a, { sha: 'x', phash: flipped }, RESAVE_BITS), false);
  assert.equal(samePhoto(a, { sha: 'x', phash: flipped }, COPY_BITS), true);
});

test('a flat picture has no usable fingerprint and never "matches"', () => {
  const flat: Image = { data: new Uint8Array(200 * 150 * 4).fill(180), width: 200, height: 150 };
  const h = differenceHash(flat.data, flat.width, flat.height)!;
  assert.equal(informative(h), false);
  assert.equal(samePhoto({ sha: 'a', phash: h }, { sha: 'b', phash: h }, COPY_BITS), false);
  assert.equal(informative(null), false);
  assert.equal(informative(Object.values(LIBRARY_HASHES)[0]), true);
});

test('unreadable or non-JPEG data gives an exact hash only, without throwing', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  assert.equal(photoFingerprint(png).phash, null);
  assert.match(photoFingerprint(png).sha, /^[0-9a-f]{64}$/);
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]).toString('base64');
  assert.equal(photoFingerprint(broken).phash, null);
  assert.equal(hamming('abc', null), PHASH_BITS);
  assert.equal(hamming('zz', 'zz'), PHASH_BITS);
  assert.equal(differenceHash(new Uint8Array(4 * 4 * 4), 4, 4), null); // too small to grid
});

test('a copy flipped left to right is recognised through the mirror fingerprint', () => {
  let caught = 0;
  const sample = files.filter((_, i) => i % 9 === 0); // 11 photos
  for (const f of sample) {
    const img = decode(load(f));
    const flipped = new Uint8Array(img.data.length);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      flipped.set(img.data.subarray((y * img.width + (img.width - 1 - x)) * 4, (y * img.width + (img.width - 1 - x)) * 4 + 4), (y * img.width + x) * 4);
    }
    const original = differenceHash(img.data, img.width, img.height)!;
    const mirrored = differenceHash(flipped, img.width, img.height)!;
    assert.ok(hamming(original, mirrored) > COPY_BITS, `${f}: a flipped copy would slip past a plain comparison`);
    if (hamming(mirrorHash(original), mirrored) <= COPY_BITS) caught++;
  }
  assert.equal(caught, sample.length);
  assert.equal(mirrorHash(null), null);
  assert.equal(mirrorHash('xyz'), null);
  const h = Object.values(LIBRARY_HASHES)[0];
  assert.equal(mirrorHash(mirrorHash(h)), h); // flipping twice is the original
});
