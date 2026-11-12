// The look-alike fingerprint (api/_lib/phash.ts): the same picture is
// recognised after being re-saved, resized, trimmed a little or flipped, and
// different pictures are never taken for the same one. That second half
// matters most: a mistake there turns down an honest player's photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import {
  allowedDifferences, compare, lookAlikePrint, looksTheSame, MIN_SHARED_BITS, mirrorPrint, PHASH_BITS, photoFingerprint, samePhoto, type Print,
} from '../api/_lib/phash';
import { LIBRARY_PRINTS } from '../api/_lib/libraryHashes';
import { libraryPrints } from '../scripts/hash-library';

const DIR = join(__dirname, '..', 'site', 'img', 'library');
const files = readdirSync(DIR).filter((f) => f.endsWith('.jpg')).sort();
const load = (f: string) => readFileSync(join(DIR, f));

type Image = { data: Uint8Array; width: number; height: number };
const decode = (b: Buffer): Image => jpeg.decode(b, { useTArray: true });
// Shrink by averaging (what a real resize does), not by picking pixels.
function resize(img: Image, w: number): Image {
  const h = Math.max(1, Math.round((img.height * w) / img.width));
  const sum = new Float64Array(w * h * 3);
  const n = new Uint32Array(w * h);
  for (let y = 0; y < img.height; y++) {
    const ty = Math.min(h - 1, Math.floor((y * h) / img.height));
    for (let x = 0; x < img.width; x++) {
      const t = ty * w + Math.min(w - 1, Math.floor((x * w) / img.width));
      const i = (y * img.width + x) * 4;
      sum[t * 3] += img.data[i];
      sum[t * 3 + 1] += img.data[i + 1];
      sum[t * 3 + 2] += img.data[i + 2];
      n[t]++;
    }
  }
  const out = new Uint8Array(w * h * 4);
  for (let t = 0; t < w * h; t++) out.set([sum[t * 3] / n[t], sum[t * 3 + 1] / n[t], sum[t * 3 + 2] / n[t], 255], t * 4);
  return { data: out, width: w, height: h };
}
function crop(img: Image, left: number, top: number, w: number, h: number): Image {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((top + y) * img.width + left) * 4, ((top + y) * img.width + left + w) * 4), y * w * 4);
  return { data: out, width: w, height: h };
}
function flip(img: Image): Image {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (y * img.width + (img.width - 1 - x)) * 4);
  return { data: out, width: img.width, height: img.height };
}
const resave = (img: Image, quality: number) => jpeg.encode(img as any, quality).data.toString('base64');
const printOf = (b64: string): Print => {
  const { phash, mask } = photoFingerprint(b64);
  return { phash, mask };
};
const decisiveBits = (p: Print) => compare(p, p)!.shared;

test('the library fingerprints file is up to date (run: npx tsx scripts/hash-library.ts)', () => {
  assert.deepEqual(LIBRARY_PRINTS, libraryPrints());
  assert.equal(Object.keys(LIBRARY_PRINTS).length, files.length);
});

test('a fingerprint is two 256-bit parts, and the same bytes always give the same one', () => {
  const b64 = load(files[0]).toString('base64');
  const a = photoFingerprint(b64);
  assert.match(a.sha, /^[0-9a-f]{64}$/);
  assert.match(a.phash!, /^[0-9a-f]{64}$/);
  assert.match(a.mask!, /^[0-9a-f]{64}$/);
  assert.equal(PHASH_BITS, 256);
  assert.deepEqual(photoFingerprint(b64), a);
  assert.deepEqual(compare(a, a), { shared: decisiveBits(a), differing: 0 });
});

test('different photos are never taken for the same picture: no two library photos, flipped or not', () => {
  const prints = Object.values(LIBRARY_PRINTS);
  let closest = Infinity; // how far beyond the limit the nearest pair of different photos is, in bits
  for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) {
    for (const b of [prints[j], mirrorPrint(prints[j])!]) {
      assert.equal(looksTheSame(prints[i], b), false);
      const c = compare(prints[i], b)!;
      if (c.shared >= MIN_SHARED_BITS) closest = Math.min(closest, c.differing - allowedDifferences(c.shared));
    }
  }
  assert.ok(closest >= 8, `the closest pair of different photos is only ${closest} bits beyond the limit`);
});

// Photos with plain backgrounds (a bird against clear sky, an animal on snow)
// are where a look-alike fingerprint goes wrong: most of the picture is a
// smooth change in brightness, the same in every such photo. These scenes are
// drawn here rather than kept as files: a smooth background with its own
// colour, brightness slope and darker corners, a little sensor noise, and one
// small "animal" at a different place and size each time.
function plainScene(seed: number): Image {
  let state = seed * 2654435761 >>> 0;
  const rnd = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const width = 640, height = 480;
  const kind = seed % 3; // sky, water, snow
  const base = kind === 0 ? [70 + rnd() * 60, 130 + rnd() * 50, 200 + rnd() * 40] : kind === 1 ? [60 + rnd() * 60, 90 + rnd() * 50, 100 + rnd() * 50] : [215 + rnd() * 25, 217 + rnd() * 25, 221 + rnd() * 25];
  const vert = (rnd() - 0.3) * 70, horiz = (rnd() - 0.5) * 50, corners = rnd() * 0.12;
  // the animal: a dark blob of 1% to 6% of the frame
  const size = Math.sqrt((0.01 + rnd() * 0.05) * width * height);
  const cx = width * (0.15 + rnd() * 0.7), cy = height * (0.15 + rnd() * 0.7), stretch = 0.6 + rnd() * 0.9, shade = 20 + rnd() * 70;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width - 0.5, v = y / height - 0.5;
    const light = 1 + (vert * v + horiz * u) / 150 - corners * (u * u + v * v) * 2;
    const dx = (x - cx) / (size * stretch), dy = (y - cy) / size;
    const inside = dx * dx + dy * dy < 0.25;
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) {
      const noise = (rnd() - 0.5) * 6;
      data[i + c] = Math.max(0, Math.min(255, (inside ? shade + (c === 0 ? 15 : 0) : base[c] * light) + noise));
    }
    data[i + 3] = 255;
  }
  return { data, width, height };
}

test('photos with plain backgrounds are not taken for each other', () => {
  const scenes = Array.from({ length: 45 }, (_, i) => plainScene(i + 1));
  const prints = scenes.map((s) => printOf(resave(s, 60)));
  let comparable = 0;
  for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) {
    for (const b of [prints[j], mirrorPrint(prints[j])!]) {
      const c = compare(prints[i], b)!;
      if (c.shared >= MIN_SHARED_BITS) comparable++;
      assert.equal(looksTheSame(prints[i], b), false, `scenes ${i + 1} and ${j + 1} (${c.differing} of ${c.shared} differ)`);
    }
  }
  // Most such photos have too little detail to compare at all, which is the point:
  // then only the very same file counts as a copy.
  const withDetail = prints.filter((p) => decisiveBits(p) >= MIN_SHARED_BITS).length;
  assert.ok(withDetail < prints.length, 'expected some plain scenes to have too little detail to compare');
  // A re-saved copy of a plain scene that does have enough detail is still recognised.
  let caught = 0, tried = 0;
  scenes.forEach((s, i) => {
    const copy = printOf(resave(resize(s, 512), 50));
    if (compare(prints[i], copy)!.shared < MIN_SHARED_BITS) return;
    tried++;
    if (looksTheSame(prints[i], copy)) caught++;
  });
  assert.equal(caught, tried);
  assert.ok(comparable >= 0);
});

test('a resized, re-saved copy is recognised as the same picture', () => {
  const sample = files.filter((_, i) => i % 5 === 0); // 20 photos
  for (const f of sample) {
    const original = photoFingerprint(load(f).toString('base64'));
    const copy = photoFingerprint(resave(resize(decode(load(f)), 1024), 55));
    assert.notEqual(copy.sha, original.sha); // different bytes…
    assert.equal(samePhoto({ ...copy, sha: null }, original), true, f); // …same picture
    // and the bits both rely on hardly move at all
    const c = compare(original, copy)!;
    assert.ok(c.differing <= 2, `${f}: ${c.differing} of ${c.shared} decisive bits differ`);
  }
});

test('a copy with a sliver trimmed off each side is recognised; a different crop of the scene is a different picture', () => {
  const sample = files.filter((_, i) => i % 9 === 0); // 11 photos
  let caught = 0;
  for (const f of sample) {
    const img = decode(load(f));
    const original = printOf(load(f).toString('base64'));
    const dx = Math.round(img.width * 0.01), dy = Math.round(img.height * 0.01);
    if (looksTheSame(original, printOf(resave(resize(crop(img, dx, dy, img.width - 2 * dx, img.height - 2 * dy), 1024), 60)))) caught++;
    // the left 70% of the scene is not the same picture as the whole
    assert.equal(looksTheSame(original, printOf(resave(crop(img, 0, 0, Math.round(img.width * 0.7), img.height), 70))), false, f);
  }
  assert.equal(caught, sample.length);
});

test('a copy flipped left to right is recognised through the mirror fingerprint', () => {
  const sample = files.filter((_, i) => i % 9 === 0); // 11 photos
  for (const f of sample) {
    const img = decode(load(f));
    const original = printOf(load(f).toString('base64'));
    const flipped = printOf(resave(flip(img), 70));
    assert.equal(looksTheSame(original, flipped), false, `${f}: a flipped copy slips past a plain comparison`);
    assert.equal(looksTheSame(mirrorPrint(flipped)!, original), true, f);
    assert.equal(samePhoto(flipped, original), true, f); // samePhoto tries both ways round
  }
  const p = Object.values(LIBRARY_PRINTS)[0];
  assert.deepEqual(mirrorPrint(mirrorPrint(p)!), p); // flipping twice is the original
  assert.equal(mirrorPrint({ phash: null, mask: null }), null);
  assert.equal(mirrorPrint({ phash: 'xyz', mask: 'xyz' }), null);
});

test('the same bytes are the same photo whatever the fingerprints say; without either, nothing matches', () => {
  const a = photoFingerprint(load(files[3]).toString('base64'));
  assert.equal(samePhoto({ sha: a.sha }, { sha: a.sha }), true);
  assert.equal(samePhoto({ sha: 'x', phash: a.phash, mask: a.mask }, { sha: 'y', phash: a.phash, mask: a.mask }), true);
  assert.equal(samePhoto({ sha: 'x' }, { sha: 'y' }), false);
  assert.equal(samePhoto({ sha: 'x', phash: a.phash, mask: null }, { sha: 'y', phash: a.phash, mask: a.mask }), false); // half a fingerprint is none
  assert.equal(samePhoto({}, {}), false);
  assert.equal(compare({ phash: 'zz', mask: 'zz' }, a), null);
});

test('the rule: enough decisive bits in common, and hardly any of them disagreeing', () => {
  const all = 'f'.repeat(64);
  const bits = 'a5c3'.repeat(16);
  const flipBits = (hex: string, n: number) => hex.split('').map((c, i) => (i < n ? (parseInt(c, 16) ^ 1).toString(16) : c)).join(''); // n bits, one per hex digit
  const maskOf = (n: number) => 'f'.repeat(n / 4) + '0'.repeat(64 - n / 4); // the first n comparisons are decisive
  assert.deepEqual([allowedDifferences(48), allowedDifferences(64), allowedDifferences(100), allowedDifferences(256)], [1, 3, 7, 22]);
  assert.equal(looksTheSame({ phash: bits, mask: all }, { phash: flipBits(bits, 22), mask: all }), true);
  assert.equal(looksTheSame({ phash: bits, mask: all }, { phash: flipBits(bits, 23), mask: all }), false);
  // with few decisive bits in common almost none may differ…
  assert.equal(looksTheSame({ phash: bits, mask: maskOf(48) }, { phash: flipBits(bits, 1), mask: all }), true);
  assert.equal(looksTheSame({ phash: bits, mask: maskOf(48) }, { phash: flipBits(bits, 2), mask: all }), false);
  // …and below the minimum the pictures are not compared at all, even when identical
  assert.equal(looksTheSame({ phash: bits, mask: maskOf(44) }, { phash: bits, mask: all }), false);
  // bits that are not decisive in both pictures are ignored
  assert.deepEqual(compare({ phash: bits, mask: maskOf(64) }, { phash: flipBits(bits, 64), mask: maskOf(32) }), { shared: 32, differing: 8 }); // one flipped bit in each of the 8 shared hex digits
});

test('a picture with no detail has nothing to compare and never "matches"', () => {
  const flat: Image = { data: new Uint8Array(200 * 150 * 4).fill(180), width: 200, height: 150 };
  const p = lookAlikePrint(flat.data, flat.width, flat.height)!;
  assert.equal(decisiveBits(p), 0);
  assert.equal(samePhoto({ sha: 'a', ...p }, { sha: 'b', ...p }), false);
  assert.equal(lookAlikePrint(new Uint8Array(4 * 4 * 4), 4, 4), null); // too small to grid
});

test('unreadable, non-JPEG or oversized data gives an exact hash only, without throwing', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  assert.deepEqual([photoFingerprint(png).phash, photoFingerprint(png).mask], [null, null]);
  assert.match(photoFingerprint(png).sha, /^[0-9a-f]{64}$/);
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]).toString('base64');
  assert.equal(photoFingerprint(broken).phash, null);
  // far larger than anything the app sends (6 megapixels): not decoded
  const big = jpeg.encode({ data: new Uint8Array(3000 * 2000 * 4).fill(128), width: 3000, height: 2000 }, 50).data.toString('base64');
  assert.equal(photoFingerprint(big).phash, null);
  assert.match(photoFingerprint(big).sha, /^[0-9a-f]{64}$/);
});

test('the sample watermarked pictures are recognised as copies of Scout\'s photos', () => {
  const samples = readdirSync(join(__dirname, '..', 'eval', 'cheat-samples')).filter((f) => f.startsWith('watermark-'));
  assert.ok(samples.length >= 3);
  for (const f of samples) {
    const original = LIBRARY_PRINTS[f.replace(/^watermark-/, '').replace(/\.jpg$/, '')];
    assert.ok(original, f);
    assert.equal(samePhoto(printOf(readFileSync(join(__dirname, '..', 'eval', 'cheat-samples', f)).toString('base64')), original), true, f);
  }
});
