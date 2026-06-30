// Identification-result handling + the offline analysis queue.
//
// When the device is offline at capture time the photo can't reach the AI, so we
// stash it on disk and mark the sighting 'queued'. processAnalysisQueue() retries
// those captures whenever the app launches or returns to the foreground, scoring
// them automatically once connectivity is back.

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { IdentifyInput, IdentifyOutcome } from './identify';
import { identifySighting, OfflineError } from './identify';
import { scoreSighting } from './scoring';
import { useJournalStore } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';

// Queued-capture photos live here so they survive app restarts (native only).
const QUEUE_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}queued/` : null;

// Persists a captured photo and returns its file URI, so an offline capture can be
// re-analyzed (and still shown) later. Native-only; returns undefined on web.
export async function persistQueuedPhoto(id: string, base64: string): Promise<string | undefined> {
  if (Platform.OS === 'web' || !QUEUE_DIR) return undefined;
  try {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
    const uri = `${QUEUE_DIR}${id}.jpg`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  } catch {
    return undefined;
  }
}

// Same, but copies an existing photo file into the queue (no base64 round-trip).
// Used by rapid-fire capture so each shot is as fast as possible — the queue reads
// the bytes back when it analyzes. Native-only; returns undefined on web.
export async function persistQueuedPhotoFromUri(id: string, srcUri: string): Promise<string | undefined> {
  if (Platform.OS === 'web' || !QUEUE_DIR) return undefined;
  try {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
    const uri = `${QUEUE_DIR}${id}.jpg`;
    await FileSystem.copyAsync({ from: srcUri, to: uri });
    return uri;
  } catch {
    return undefined;
  }
}

// Cheap, stable hash of a photo's bytes (FNV-1a, salted with length) for detecting
// an exact-duplicate resubmission within a player's own journal.
export function hashPhotoBase64(base64: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < base64.length; i++) {
    h ^= base64.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${base64.length}`;
}

// Writes an identification result into the journal: rejected / ineligible / scored.
// Shared by the capture screen and the offline retry queue so both score identically.
// `photoHash` (when provided) drives exact-duplicate and repeat-species scoring.
export function applyIdentifyOutcome(id: string, outcome: IdentifyOutcome, photoHash?: string): void {
  const { updateSighting } = useJournalStore.getState();

  if (!outcome.present) {
    updateSighting(id, {
      idStatus: 'rejected',
      caption: outcome.caption,
      source: outcome.source,
      note: outcome.note,
    });
    return;
  }

  if (!outcome.eligible) {
    updateSighting(id, {
      idStatus: 'ineligible',
      species: outcome.species,
      caption: outcome.caption,
      dangerous: outcome.dangerous,
      ineligibleReason: outcome.ineligibleReason,
      source: outcome.source,
      note: outcome.note,
    });
    return;
  }

  let points = outcome.points;
  let score = outcome.score;
  if (points == null && outcome.species && outcome.rarityScore != null) {
    const sci = outcome.species.scientificName;
    // Compare only against already-scored sightings (skip rejected / ineligible and
    // not-yet-analyzed ones) so repeats and exact duplicates are detected fairly.
    const priors = useJournalStore
      .getState()
      .sightings.filter(
        (s) =>
          s.id !== id &&
          s.points != null &&
          s.idStatus !== 'rejected' &&
          s.idStatus !== 'ineligible',
      );
    const priorSameSpecies = priors.filter((s) => s.species?.scientificName === sci).length;
    const duplicatePhoto = photoHash != null && priors.some((s) => s.photoHash === photoHash);
    score = scoreSighting({
      rarityScore: outcome.rarityScore,
      sceneTags: outcome.sceneTags,
      firstOfSpecies: priorSameSpecies === 0,
      priorSameSpecies,
      duplicatePhoto,
    });
    points = score.totalPoints;
  }

  updateSighting(id, {
    species: outcome.species,
    sceneTags: outcome.sceneTags,
    caption: outcome.caption,
    idStatus: outcome.idStatus,
    dangerous: outcome.dangerous,
    points,
    score,
    photoHash,
    source: outcome.source,
    note: outcome.note,
  });
  useAppStore.getState().registerActivityToday();
}

let running = false;

// Retries every queued (offline) capture. Safe to call often: it no-ops when
// there's nothing queued or a run is already going, and leaves a capture queued
// if the device is still offline.
export async function processAnalysisQueue(): Promise<void> {
  if (running || Platform.OS === 'web') return;
  running = true;
  try {
    const queued = useJournalStore.getState().sightings.filter((s) => s.idStatus === 'queued');
    for (const s of queued) {
      if (!s.photoUri) continue;
      let base64: string;
      try {
        base64 = await FileSystem.readAsStringAsync(s.photoUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        continue; // photo unreadable; leave it queued
      }
      const input: IdentifyInput = {
        photoBase64: base64,
        lat: s.lat,
        lng: s.lng,
        accuracyM: s.accuracyM,
        observedAt: s.observedAt,
      };
      try {
        applyIdentifyOutcome(s.id, await identifySighting(input), hashPhotoBase64(base64));
      } catch (err) {
        if (err instanceof OfflineError) break; // still offline — stop and retry later
        // Any other error: leave this capture queued and move on.
      }
    }
  } finally {
    running = false;
  }
}
