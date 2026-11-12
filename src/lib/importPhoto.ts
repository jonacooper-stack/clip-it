// Lets a player upload an existing photo from their camera roll instead of
// capturing in-app — handy when they snapped an animal before opening ClipIt.
// We pull the photo's real capture date and GPS location from its metadata so
// the sighting is timed and placed correctly (not stamped "now / here").
//
// Reading the saved location is the reliable part: iOS's photo picker strips GPS
// from the returned EXIF, but the underlying asset still carries it, so we read it
// straight from MediaLibrary when we have library access. EXIF is a fallback.

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { resizedBase64, CAPTURE_QUALITY } from './prepareImage';
import { savePhoto } from './photoStore';
import { exifFromJpeg, photoEvidence, type PhotoEvidence } from '../../shared/photoEvidence';

export interface ImportedPhoto {
  uri: string;
  base64?: string;
  lat?: number;
  lng?: number;
  /** Epoch ms the photo was taken (from metadata), or now if unknown. */
  observedAt: number;
  /** Whether the photo carries a camera's details (make, lens, exposure). The
   * server only scores uploads that do: a saved picture or a screenshot doesn't. */
  evidence: PhotoEvidence;
}

// The start of a base64 file as bytes (camera details sit at the front of a JPEG).
function headBytes(base64: string, maxBytes = 131072): Uint8Array {
  try {
    const bin = globalThis.atob(base64.slice(0, Math.ceil(maxBytes / 3) * 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// EXIF dates look like "2024:06:01 14:23:05" (camera-local time, no zone). Parse
// to epoch ms using the device's local zone — a fine approximation for display.
function parseExifDate(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return Number.isNaN(t) ? undefined : t;
}

// Opens the system photo picker and returns the chosen photo plus whatever date /
// location we can recover. Returns null if the user cancels.
export async function pickImageWithMetadata(): Promise<ImportedPhoto | null> {
  // Library access lets us both pick and read the photo's stored date/location.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: CAPTURE_QUALITY,
    base64: Platform.OS === 'web', // native downscales from the uri below
    exif: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];

  let lat: number | undefined;
  let lng: number | undefined;
  let observedAt: number | undefined;
  let libraryDetails: unknown;
  let subtypes: string[] | undefined;

  // Most reliable source: the asset's own metadata (survives the picker's EXIF
  // stripping). Native-only and best-effort.
  if (Platform.OS !== 'web' && perm.granted && a.assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(a.assetId);
      if (info.location) {
        // (On iOS the photo library hands these over as text, not numbers.)
        const libLat = num(info.location.latitude);
        const libLng = num(info.location.longitude);
        if (libLat != null && libLng != null) {
          lat = libLat;
          lng = libLng;
        }
      }
      if (info.creationTime) observedAt = info.creationTime;
      libraryDetails = info.exif;
      subtypes = (info as { mediaSubtypes?: string[] }).mediaSubtypes;
    } catch {
      // fall back to EXIF below
    }
  }

  // Fallback to whatever EXIF the picker handed back (shapes vary by platform).
  const exif = (a.exif ?? {}) as Record<string, any>;
  if (lat == null || lng == null) {
    const gps = exif['{GPS}'] ?? exif;
    const exLat = num(gps.Latitude ?? gps.GPSLatitude);
    const exLng = num(gps.Longitude ?? gps.GPSLongitude);
    if (exLat != null && exLng != null) {
      const latRef = gps.LatitudeRef ?? gps.GPSLatitudeRef;
      const lngRef = gps.LongitudeRef ?? gps.GPSLongitudeRef;
      lat = latRef === 'S' ? -Math.abs(exLat) : exLat;
      lng = lngRef === 'W' ? -Math.abs(exLng) : exLng;
    }
  }
  if (observedAt == null) {
    const ex = exif['{Exif}'] ?? exif;
    observedAt = parseExifDate(ex.DateTimeOriginal ?? exif.DateTimeOriginal ?? exif.DateTime);
  }

  // Shrink a copy for the AI on every platform (a full-size upload can be too
  // big for the server to accept); on web the picker's own bytes are the
  // fallback if the browser can't resize.
  const small = await resizedBase64(a.uri, { width: a.width, height: a.height });
  const base64 = small ?? (Platform.OS === 'web' ? a.base64 ?? undefined : undefined);
  // Persist a copy so it survives app updates (stored as a stable relative ref).
  const uri = Platform.OS === 'web' ? a.uri : (await savePhoto(a.uri)) ?? a.uri;
  // Does it look like it came out of a camera? Whatever details we can get:
  // the picker's, the photo library's, or (on the web, where neither exists)
  // read straight from the file.
  const fromFile = Platform.OS === 'web' && a.base64 ? exifFromJpeg(headBytes(a.base64)) : null;
  const evidence = photoEvidence({ picker: a.exif ?? null, library: libraryDetails ?? null, file: fromFile }, { subtypes });
  return { uri, base64, lat, lng, observedAt: observedAt ?? Date.now(), evidence };
}
