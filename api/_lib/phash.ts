// A photo's fingerprints, for spotting the same picture handed in twice (by
// one player, by two players, or lifted from Scout's own library).
//
//   sha    exact: the SHA-256 of the image bytes.
//   phash  look-alike: a 256-bit "difference hash". The picture is shrunk to
//          a 17×16 grid of grey levels and each bit says whether a cell is
//          brighter than its right-hand neighbour. Re-saving, resizing or
//          recompressing a picture changes only a few bits; a different
//          picture changes about half of them.
//
// What it does not catch: a mirrored, cropped or heavily edited copy. And a
// picture that is mostly one flat tone (a bird against clear sky) has no
// reliable pattern, so `informative` says not to compare those.
import { createHash } from 'crypto';
import jpeg from 'jpeg-js';

const COLS = 17;
const ROWS = 16;
export const PHASH_BITS = (COLS - 1) * ROWS; // 256

// Decode limits: the app sends a 1280px JPEG (about 1.2 megapixels). Anything
// far larger isn't from the app; skip the look-alike hash rather than spend
// memory on it.
const MAX_MEGAPIXELS = 16;

export interface Fingerprint {
  sha: string;
  phash: string | null; // hex, 64 characters; null when the picture can't be read as a JPEG
}

export function photoFingerprint(base64: string): Fingerprint {
  const bytes = Buffer.from(base64, 'base64');
  const sha = createHash('sha256').update(bytes).digest('hex');
  let phash: string | null = null;
  // JPEG only (what the app sends). Other formats keep the exact check.
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    try {
      const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxResolutionInMP: MAX_MEGAPIXELS, maxMemoryUsageInMB: 256 });
      phash = differenceHash(img.data, img.width, img.height);
    } catch {
      phash = null;
    }
  }
  return { sha, phash };
}

// The hash of raw RGBA pixels (exported for tests).
export function differenceHash(rgba: Uint8Array, width: number, height: number): string | null {
  if (width < COLS || height < ROWS) return null;
  // Average grey level of each grid cell (every pixel counted once).
  const sum = new Float64Array(COLS * ROWS);
  const count = new Uint32Array(COLS * ROWS);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(ROWS - 1, Math.floor((y * ROWS) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(COLS - 1, Math.floor((x * COLS) / width));
      const i = (y * width + x) * 4;
      sum[gy * COLS + gx] += rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
      count[gy * COLS + gx]++;
    }
  }
  let hex = '';
  let nibble = 0;
  let bits = 0;
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS - 1; gx++) {
      const a = sum[gy * COLS + gx] / count[gy * COLS + gx];
      const b = sum[gy * COLS + gx + 1] / count[gy * COLS + gx + 1];
      nibble = (nibble << 1) | (a > b ? 1 : 0);
      if (++bits % 4 === 0) {
        hex += nibble.toString(16);
        nibble = 0;
      }
    }
  }
  return hex;
}

const ONES = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

// How many of the 256 bits differ (256 when either hash is missing or malformed).
export function hamming(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b || a.length !== b.length) return PHASH_BITS;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16);
    const y = parseInt(b[i], 16);
    if (Number.isNaN(x) || Number.isNaN(y)) return PHASH_BITS;
    d += ONES[x ^ y];
  }
  return d;
}

// A flat picture gives a hash that is nearly all zeros or all ones, which
// "matches" every other flat picture. Only compare hashes with a real pattern.
export function informative(phash: string | null | undefined): boolean {
  if (!phash || phash.length !== PHASH_BITS / 4) return false;
  let ones = 0;
  for (const c of phash) {
    const n = parseInt(c, 16);
    if (Number.isNaN(n)) return false;
    ones += ONES[n];
  }
  return ones >= PHASH_BITS * 0.12 && ones <= PHASH_BITS * 0.88;
}

// How close two look-alike hashes must be to call two pictures the same one.
// Measured on Scout's library (tests/phash.test.ts): a copy that was resized
// and re-saved differs by 0–18 bits, a copy with a sliver cropped off by
// 20–45, and the closest pair of genuinely different photos by 90.
//
//   COPY_BITS   another account's photo, or one of Scout's: generous enough
//               to catch re-saved and lightly cropped copies, still far from
//               any honest coincidence.
//   RESAVE_BITS the player's own journal: tight, so that only the very same
//               picture counts as a duplicate. Two frames of one burst are
//               different photos and keep their normal (reduced) score.
export const COPY_BITS = 24;
export const RESAVE_BITS = 4;

type Print = { sha?: string | null; phash?: string | null };

export function samePhoto(a: Print, b: Print, maxBits: number): boolean {
  if (a.sha && b.sha && a.sha === b.sha) return true;
  return informative(a.phash) && informative(b.phash) && hamming(a.phash, b.phash) <= maxBits;
}
