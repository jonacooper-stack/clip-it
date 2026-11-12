// Does a photo uploaded from the camera roll look like it came out of a
// camera? A photo taken by a phone or camera carries the camera's details
// (make, model, lens, exposure). A picture saved from the web, a screenshot
// or an AI-made image almost never does. This is one of the checks that
// decides whether an uploaded photo can score (the server makes the call;
// see api/_lib/journal.ts).
//
// It can be fooled by someone who edits a file's details on purpose. It is
// there to stop the easy cheat, not the determined one.
//
// Keep this file free of React Native and Node-only imports.

export interface PhotoEvidence {
  /** The photo names a camera or lens, or records how it was exposed. */
  camera: boolean;
  /** The device marked it as a screenshot. */
  screenshot: boolean;
  /** The photo's details name an image generator. */
  generator: boolean;
}

const CAMERA_KEYS = ['make', 'model', 'lensmake', 'lensmodel'];
const EXPOSURE_KEYS = ['exposuretime', 'shutterspeedvalue'];
const SETTING_KEYS = ['fnumber', 'aperturevalue', 'isospeedratings', 'photographicsensitivity', 'iso', 'focallength', 'focallengthin35mmfilm', 'focalleninmmfilm'];
const TEXT_KEYS = ['software', 'imagedescription', 'artist', 'usercomment', 'copyright', 'hostcomputer'];

// Names that show up in the details of AI-made pictures. This catches little
// (most such pictures carry their label where a photo picker doesn't look,
// and they already fail for having no camera details); the identifier's own
// look at the picture is the real check. So it errs on the side of not
// accusing a real photo:
//   - in "Software" (the program that wrote the file), generator names;
//   - in free text (description, artist, copyright, comment), only phrases
//     that can hardly mean anything else. Words such as "imagen" (Spanish for
//     image), "flux" or "gemini" turn up in ordinary captions and studio names.
const GENERATOR_SOFTWARE = /midjourney|dall[\s·.-]?e\b|stable\s?diffusion|sdxl|firefly|chatgpt|openai|google ai|leonardo\.?ai|ideogram|ai[\s-]?generated|trainedalgorithmicmedia/i;
const GENERATOR_PHRASES = /midjourney|dall[\s·.-]e\b|stable\s?diffusion|adobe firefly|made with google ai|ai[\s-]generated|trainedalgorithmicmedia/i;

// The picker's details arrive as one flat object on iOS and Android, but
// other sources nest them ("{Exif}", "{TIFF}"): gather every level.
function flatten(obj: Record<string, unknown>, out: Map<string, unknown>, depth = 0): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) flatten(v as Record<string, unknown>, out, depth + 1);
    else if (!out.has(k.toLowerCase())) out.set(k.toLowerCase(), v);
  }
}

const filled = (v: unknown): boolean => {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  if (Array.isArray(v)) return v.some(filled);
  return true;
};

export function photoEvidence(exif: Record<string, unknown> | null | undefined, extra: { subtypes?: readonly string[] | null } = {}): PhotoEvidence {
  const all = new Map<string, unknown>();
  if (exif && typeof exif === 'object') flatten(exif, all);
  const has = (keys: string[]) => keys.some((k) => filled(all.get(k)));
  const software = typeof all.get('software') === 'string' ? (all.get('software') as string) : '';
  const text = TEXT_KEYS.filter((k) => k !== 'software').map((k) => all.get(k)).filter((v) => typeof v === 'string').join(' \n ');
  return {
    camera: has(CAMERA_KEYS) || (has(EXPOSURE_KEYS) && has(SETTING_KEYS)),
    screenshot: Boolean(extra.subtypes?.includes('screenshot')) || /^\s*screenshot\s*$/i.test(String(all.get('usercomment') ?? '')),
    generator: GENERATOR_SOFTWARE.test(software) || GENERATOR_PHRASES.test(text),
  };
}

// Can an uploaded photo with this evidence score? (Unknown evidence, from an
// app build that doesn't send it, is treated as before: allowed.)
export function importLooksGenuine(e: PhotoEvidence | null | undefined): boolean {
  return !e || (e.camera && !e.screenshot && !e.generator);
}

// ---------- reading the details straight from a JPEG (web uploads) ----------
// The browser's file picker hands over the file's bytes with no details
// attached, so on the web we read the handful of fields we need ourselves.
// Returns null when the file has no such details (or isn't a JPEG).
const TAGS: Record<number, string> = {
  0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x013b: 'Artist',
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8827: 'ISOSpeedRatings', 0x9003: 'DateTimeOriginal',
  0x920a: 'FocalLength', 0x9286: 'UserComment', 0xa433: 'LensMake', 0xa434: 'LensModel',
};
const EXIF_IFD = 0x8769;

export function exifFromJpeg(bytes: Uint8Array): Record<string, unknown> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) return null; // image data starts: no details before it
    const size = view.getUint16(pos + 2);
    if (size < 2) return null;
    // APP1 beginning "Exif\0\0"
    if (marker === 0xe1 && size >= 14 && bytes[pos + 4] === 0x45 && bytes[pos + 5] === 0x78 && bytes[pos + 6] === 0x69 && bytes[pos + 7] === 0x66) {
      return readTiff(view, pos + 10, Math.min(pos + 2 + size, bytes.length));
    }
    pos += 2 + size;
  }
  return null;
}

function readTiff(view: DataView, start: number, end: number): Record<string, unknown> | null {
  if (start + 8 > end) return null;
  const order = view.getUint16(start);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const out: Record<string, unknown> = {};
  const u16 = (p: number) => view.getUint16(p, little);
  const u32 = (p: number) => view.getUint32(p, little);
  const seen = new Set<number>();

  const readIfd = (offset: number): void => {
    const at = start + offset;
    if (offset <= 0 || seen.has(offset) || at + 2 > end) return;
    seen.add(offset);
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      if (tag === EXIF_IFD) {
        readIfd(u32(e + 8));
        continue;
      }
      const name = TAGS[tag];
      if (!name) continue;
      const unit = type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 1; // short, long, rational, else bytes
      const bytesNeeded = unit * count;
      const at2 = bytesNeeded <= 4 ? e + 8 : start + u32(e + 8);
      if (bytesNeeded > 2000 || at2 < start || at2 + bytesNeeded > end) continue;
      if (type === 2 || type === 7) {
        let s = '';
        for (let k = 0; k < count; k++) {
          const c = view.getUint8(at2 + k);
          if (c >= 32 && c < 127) s += String.fromCharCode(c);
        }
        // UserComment starts with an 8-byte character-set label.
        out[name] = (tag === 0x9286 ? s.replace(/^(ASCII|UNICODE|JIS)/, '') : s).trim();
      } else if (type === 3) out[name] = u16(at2);
      else if (type === 4) out[name] = u32(at2);
      else if (type === 5) {
        const den = u32(at2 + 4);
        out[name] = den ? u32(at2) / den : 0;
      }
    }
  };
  readIfd(u32(start + 4));
  return Object.keys(out).length ? out : null;
}
