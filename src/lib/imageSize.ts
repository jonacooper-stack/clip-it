// Sizing rules for the copy of a photo that is sent to the AI. (Plain
// functions, no app imports: see tests/imageSize.test.ts.)

// Longest side, in pixels, of the copy sent to the AI. The model is billed by
// pixel area (one token per 28×28 block), so this is the main cost control on
// every identification: 1280×960 is about 1,600 tokens.
export const AI_MAX_DIM = 1280;

export interface Size {
  width: number;
  height: number;
}

// The resize step that brings the LONGEST side down to `maxDim`, or null when
// the photo is already small enough (never upscale: it adds bytes and AI cost
// without adding detail). With an unknown size, cap the width.
export function resizeFor(size: Size | null, maxDim: number): { width: number } | { height: number } | null {
  if (!size || !(size.width > 0) || !(size.height > 0)) return { width: maxDim };
  if (Math.max(size.width, size.height) <= maxDim) return null;
  return size.width >= size.height ? { width: maxDim } : { height: maxDim };
}

// What the model charges for an image of this size, in tokens.
export function imageTokens(size: Size): number {
  return Math.ceil(size.width / 28) * Math.ceil(size.height / 28);
}
