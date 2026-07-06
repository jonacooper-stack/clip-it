// Persistent, update-safe storage for sighting photos.
//
// iOS changes the app's container path on every update/reinstall — the UUID in
// file:///var/mobile/Containers/Data/Application/<UUID>/… changes, which silently
// breaks any ABSOLUTE path saved earlier (the file is migrated to the new
// container, but the stored path still points at the old one). Camera captures
// also live in the Caches dir, which iOS can purge at any time.
//
// So: copy every photo into the Documents dir and store a RELATIVE ref
// ("photos/<id>.jpg"), then rebuild the absolute path against the CURRENT container
// at read time. resolvePhoto() also rebases legacy absolute Documents paths, which
// rescues photos captured before this change.

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { newId } from './id';

const DOC = FileSystem.documentDirectory;
const PHOTO_DIR = DOC ? `${DOC}photos/` : null;

async function ensureDir(): Promise<void> {
  if (PHOTO_DIR) await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
}

// Copy a freshly captured / temp photo into persistent storage; returns a stable
// relative ref. On web there's no file system, so the (blob) uri is returned as-is.
export async function savePhoto(srcUri: string): Promise<string | undefined> {
  if (Platform.OS === 'web' || !DOC) return srcUri;
  try {
    await ensureDir();
    const ref = `photos/${newId()}.jpg`;
    await FileSystem.copyAsync({ from: srcUri, to: `${DOC}${ref}` });
    return ref;
  } catch {
    return undefined;
  }
}

// Same, from base64 bytes (used by the offline-queue path when there's no file).
export async function savePhotoBase64(base64: string): Promise<string | undefined> {
  if (Platform.OS === 'web' || !DOC) return undefined;
  try {
    await ensureDir();
    const ref = `photos/${newId()}.jpg`;
    await FileSystem.writeAsStringAsync(`${DOC}${ref}`, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return ref;
  } catch {
    return undefined;
  }
}

// Turn a stored photo ref into a uri loadable against the CURRENT container.
export function resolvePhoto(ref?: string | null): string | undefined {
  if (!ref) return undefined;
  if (!DOC) return ref;
  // New relative refs.
  if (ref.startsWith('photos/') || ref.startsWith('queued/')) return `${DOC}${ref}`;
  // Legacy absolute path under the app's Documents dir → rebase onto the current
  // container (rescues photos saved before we switched to relative refs).
  if (ref.startsWith('file://')) {
    const i = ref.indexOf('/Documents/');
    if (i !== -1) return `${DOC}${ref.slice(i + '/Documents/'.length)}`;
  }
  return ref; // remote / web blob / data uri
}
