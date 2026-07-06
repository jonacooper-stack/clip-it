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
import { resizedBase64 } from './prepareImage';
import { savePhoto } from './photoStore';

export interface ImportedPhoto {
  uri: string;
  base64?: string;
  lat?: number;
  lng?: number;
  /** Epoch ms the photo was taken (from metadata), or now if unknown. */
  observedAt: number;
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
    quality: 0.6,
    base64: Platform.OS === 'web', // native downscales from the uri below
    exif: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];

  let lat: number | undefined;
  let lng: number | undefined;
  let observedAt: number | undefined;

  // Most reliable source: the asset's own metadata (survives the picker's EXIF
  // stripping). Native-only and best-effort.
  if (Platform.OS !== 'web' && perm.granted && a.assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(a.assetId);
      if (info.location) {
        lat = info.location.latitude;
        lng = info.location.longitude;
      }
      if (info.creationTime) observedAt = info.creationTime;
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

  const base64 = Platform.OS === 'web' ? a.base64 ?? undefined : await resizedBase64(a.uri);
  // Persist a copy so it survives app updates (stored as a stable relative ref).
  const uri = Platform.OS === 'web' ? a.uri : (await savePhoto(a.uri)) ?? a.uri;
  return { uri, base64, lat, lng, observedAt: observedAt ?? Date.now() };
}
