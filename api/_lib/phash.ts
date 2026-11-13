// A photo's fingerprints, for spotting the same picture handed in twice (by
// two players, by one player re-uploading it, or lifted from Scout's own
// library).
//
//   sha    exact: the SHA-256 of the image bytes.
//   phash  look-alike, 256 bits. The picture is shrunk to a 17×16 grid of
//   mask   grey levels. Slow changes in brightness are taken out (each cell
//          minus the average of the cells around it), because a plain sky or
//          a snowfield is all slow change: without this step two different
//          photos of a bird in an empty sky look alike. Each bit of `phash`
//          says whether a cell is then brighter than its right-hand
//          neighbour, and the matching bit of `mask` says whether that
//          difference is big enough to rely on ("decisive").
//
// Two pictures are compared only on the bits that are decisive in both.
// Re-saving, resizing or recompressing a picture leaves those bits as they
// were; a different picture usually disagrees on a fifth of them or more.
// Not always: two shots from a camera that never moves (a trail camera, a
// feeder camera) share a background, and a small animal in one of them
// barely changes the grid, so they can look like one picture. The journal's
// rules allow for that (api/_lib/journal.ts recordSighting).
//
// Measured with this code on Scout's library plus 200 photos of birds in
// flight and animals in snow (44,551 pairs of different photos, flipped and
// not): none was called the same picture, and the closest pair was 7 bits
// beyond the limit. Copies that were resized and re-saved, flipped, or had 1%
// trimmed off each side were recognised whenever the picture had enough
// decisive bits to compare: all of the library and snow photos, three
// quarters of the sky photos. tests/phash.test.ts keeps watch on both.
//
// What it does not catch: a copy with more than a sliver cropped off, or one
// that was edited. And a picture with almost no detail (fewer than
// MIN_SHARED_BITS decisive bits) can't be compared at all: for those only the
// exact check applies.
import { createHash } from 'crypto';
import jpeg from 'jpeg-js';

const COLS = 17;
const ROWS = 16;
export const PHASH_BITS = (COLS - 1) * ROWS; // 256
const HEX = /^[0-9a-f]{64}$/;

// A difference between neighbouring cells counts as decisive from this many
// grey levels (of 255).
const MARGIN = 3;
// Two pictures need this many decisive bits in common to be compared at all…
export const MIN_SHARED_BITS = 48;
// …and are the same picture when at most a tenth of those disagree, less
// three (so that with few bits in common, almost none may disagree).
export const allowedDifferences = (shared: number) => Math.floor(shared / 10) - 3;

// Decode limits. The app sends a 1280px JPEG (about 1.2 megapixels) and wall
// photos are 1600px; anything far larger isn't from the app, and decoding it
// would tie up the server. Such a photo keeps the exact check only.
// (jpeg-js's own memory count comes to about half of what decoding really
// takes.)
const MAX_MEGAPIXELS = 4;
const MAX_DECODE_MB = 64;

export interface Fingerprint {
  sha: string;
  /** Hex, 64 characters each; null when the picture can't be read as a JPEG of a sensible size. */
  phash: string | null;
  mask: string | null;
}

// What two pictures are compared on.
export interface Print {
  sha?: string | null;
  phash?: string | null;
  mask?: string | null;
}

export function photoFingerprint(base64: string): Fingerprint {
  const bytes = Buffer.from(base64, 'base64');
  const sha = createHash('sha256').update(bytes).digest('hex');
  // JPEG only (what the app sends). Other formats keep the exact check.
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    try {
      const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxResolutionInMP: MAX_MEGAPIXELS, maxMemoryUsageInMB: MAX_DECODE_MB });
      const print = lookAlikePrint(img.data, img.width, img.height);
      if (print) return { sha, ...print };
    } catch {
      // unreadable, or too large: exact check only
    }
  }
  return { sha, phash: null, mask: null };
}

// The look-alike fingerprint of raw RGBA pixels (exported for tests).
export function lookAlikePrint(rgba: Uint8Array, width: number, height: number): { phash: string; mask: string } | null {
  if (width < COLS || height < ROWS) return null;
  // Average grey level of each grid cell (every pixel counted once).
  const grid = new Float64Array(COLS * ROWS);
  const count = new Uint32Array(COLS * ROWS);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(ROWS - 1, Math.floor((y * ROWS) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(COLS - 1, Math.floor((x * COLS) / width));
      const i = (y * width + x) * 4;
      grid[gy * COLS + gx] += rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
      count[gy * COLS + gx]++;
    }
  }
  for (let i = 0; i < grid.length; i++) grid[i] /= count[i];
  // Take the lighting out: each cell minus the average of its 3×3
  // neighbourhood (cells beyond the edge repeat the edge).
  const detail = new Float64Array(COLS * ROWS);
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      let around = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          around += grid[Math.min(ROWS - 1, Math.max(0, gy + dy)) * COLS + Math.min(COLS - 1, Math.max(0, gx + dx))];
        }
      }
      detail[gy * COLS + gx] = grid[gy * COLS + gx] - around / 9;
    }
  }
  const bits: number[] = [];
  const decisive: number[] = [];
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS - 1; gx++) {
      const d = detail[gy * COLS + gx] - detail[gy * COLS + gx + 1];
      bits.push(d > 0 ? 1 : 0);
      decisive.push(Math.abs(d) >= MARGIN ? 1 : 0);
    }
  }
  return { phash: toHex(bits), mask: toHex(decisive) };
}

function toHex(bits: number[]): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  return hex;
}

const ONES = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

// How two look-alike fingerprints compare: how many bits are decisive in
// both, and how many of those disagree. Null when either can't be compared.
export function compare(a: Print, b: Print): { shared: number; differing: number } | null {
  if (!a.phash || !a.mask || !b.phash || !b.mask) return null;
  if (!HEX.test(a.phash) || !HEX.test(a.mask) || !HEX.test(b.phash) || !HEX.test(b.mask)) return null;
  let shared = 0;
  let differing = 0;
  for (let i = 0; i < 64; i++) {
    const both = parseInt(a.mask[i], 16) & parseInt(b.mask[i], 16);
    shared += ONES[both];
    differing += ONES[(parseInt(a.phash[i], 16) ^ parseInt(b.phash[i], 16)) & both];
  }
  return { shared, differing };
}

// The same picture, as far as the look-alike fingerprints can tell.
export function looksTheSame(a: Print, b: Print): boolean {
  const c = compare(a, b);
  return c !== null && c.shared >= MIN_SHARED_BITS && c.differing <= allowedDifferences(c.shared);
}

// The fingerprint the same picture would have if it were flipped left to
// right (the simplest way to disguise a copy). Each row's comparisons run the
// other way round: reverse the row, and invert the bits (not the mask).
export function mirrorPrint(p: Print): { phash: string; mask: string } | null {
  if (!p.phash || !p.mask || !HEX.test(p.phash) || !HEX.test(p.mask)) return null;
  const flipRow = (hex: string, row: number, invert: boolean): string => {
    const bits = parseInt(hex.slice(row * 4, row * 4 + 4), 16); // 16 comparisons
    let out = 0;
    for (let i = 0; i < 16; i++) if (Boolean((bits >> i) & 1) !== invert) out |= 1 << (15 - i);
    return out.toString(16).padStart(4, '0');
  };
  let phash = '';
  let mask = '';
  for (let row = 0; row < ROWS; row++) {
    phash += flipRow(p.phash, row, true);
    mask += flipRow(p.mask, row, false);
  }
  return { phash, mask };
}

// The same picture: the very same bytes, or look-alike fingerprints that say
// so, flipped or not.
export function samePhoto(a: Print, b: Print): boolean {
  if (a.sha && b.sha && a.sha === b.sha) return true;
  if (looksTheSame(a, b)) return true;
  const flipped = mirrorPrint(a);
  return flipped !== null && looksTheSame(flipped, b);
}
