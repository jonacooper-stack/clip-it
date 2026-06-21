// Holds the base64 photo bytes for an in-flight capture, in memory only, so we
// never write large blobs into persisted storage. The identifying screen claims
// the bytes once and clears them.

const photos = new Map<string, string>();

export function setPendingPhoto(id: string, base64: string): void {
  photos.set(id, base64);
}

export function takePendingPhoto(id: string): string | undefined {
  const value = photos.get(id);
  photos.delete(id);
  return value;
}
