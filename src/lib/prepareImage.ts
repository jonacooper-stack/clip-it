// Downscale a captured/imported photo before it's sent to the AI endpoint.
//
// A full-resolution phone photo, base64-encoded, can exceed the serverless
// request-size limit (Vercel caps request bodies at ~4.5 MB → HTTP 413), which
// silently drops the app back to the demo identifier. Vision models identify wildlife
// perfectly well at ~1280px, so resizing keeps the payload small, the upload fast,
// and the AI bill lower. We keep the full-resolution copy for display / the camera
// roll; only the AI gets the shrunk version.

import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIM = 1280;

// Returns a compact base64 JPEG of the photo at `uri`, or undefined if it can't be
// produced (the caller then falls back to whatever it has).
export async function resizedBase64(uri: string): Promise<string | undefined> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIM } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return result.base64 ?? undefined;
  } catch {
    return undefined;
  }
}
