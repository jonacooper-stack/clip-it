// Downscale a captured/imported photo before it's sent to the AI endpoint.
//
// A full-resolution phone photo, base64-encoded, can exceed the serverless
// request-size limit (Vercel caps request bodies at ~4.5 MB → HTTP 413), which
// silently drops the app back to the demo identifier. Vision models identify wildlife
// perfectly well at ~1280px, so resizing keeps the payload small, the upload fast,
// and the AI bill lower (the model is billed by pixel area). We keep the
// full-resolution copy for display / the camera roll; only the AI gets the
// shrunk version.

import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

// Longest side, in pixels, of the copy sent to the AI.
export const AI_MAX_DIM = 1280;

// Quality for photos people look at (journal, camera roll, the wall). The AI copy
// stays small (above); what players see should stay sharp.
export const CAPTURE_QUALITY = 0.85;

export interface Size {
  width: number;
  height: number;
}

// The resize step that brings the LONGEST side down to `maxDim`, or none when
// the photo is already small enough (never upscale: it adds bytes and AI cost
// without adding detail).
export function resizeFor(size: Size | null, maxDim: number): { width: number } | { height: number } | null {
  if (!size || !(size.width > 0) || !(size.height > 0)) return { width: maxDim }; // unknown size: cap the width
  if (Math.max(size.width, size.height) <= maxDim) return null;
  return size.width >= size.height ? { width: maxDim } : { height: maxDim };
}

function imageSize(uri: string): Promise<Size | null> {
  return new Promise((resolve) => {
    try {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

// Returns a compact base64 JPEG of the photo at `uri`, or undefined if it can't be
// produced (the caller then falls back to whatever it has). Defaults suit the AI
// call; pass larger values for photos people will see (e.g. wall posts). Pass
// the photo's `width`/`height` when the camera or picker already reported them
// (saves a lookup). Re-encoding also strips the photo's metadata (GPS, device).
export async function resizedBase64(
  uri: string,
  opts: { maxDim?: number; compress?: number; width?: number; height?: number } = {},
): Promise<string | undefined> {
  try {
    const maxDim = opts.maxDim ?? AI_MAX_DIM;
    const save = { compress: opts.compress ?? 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true };
    const known = opts.width && opts.height ? { width: opts.width, height: opts.height } : await imageSize(uri);
    const resize = resizeFor(known, maxDim);
    let result = await ImageManipulator.manipulateAsync(uri, resize ? [{ resize }] : [], save);
    // The reported size can be the sensor's, before the photo's rotation is
    // applied; if the result is still too tall or wide, shrink the other way
    // (cheap: the input is already small).
    if (Math.max(result.width || 0, result.height || 0) > maxDim) {
      const again = resizeFor({ width: result.width, height: result.height }, maxDim);
      if (again) result = await ImageManipulator.manipulateAsync(result.uri, [{ resize: again }], save);
    }
    return result.base64 ?? undefined;
  } catch {
    return undefined;
  }
}

// Wall posts are shown full-width on high-resolution phones: keep them sharp.
export const WALL_PHOTO = { maxDim: 1600, compress: 0.85 };
// Avatars are shown small; this keeps them crisp without a big upload.
export const AVATAR_PHOTO = { maxDim: 600, compress: 0.85 };
