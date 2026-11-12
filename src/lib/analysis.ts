// Identification-result handling + the offline analysis queue.
//
// When the device is offline at capture time the photo can't reach the AI, so we
// stash it on disk and mark the sighting 'queued'. processAnalysisQueue() retries
// those captures whenever the app launches or returns to the foreground, scoring
// them automatically once connectivity is back.

import { Platform } from 'react-native';
import type { IdentifyInput, IdentifyOutcome } from './identify';
import { identifySighting, isPermanentFailure, OfflineError } from './identify';
import { fetchCrewNotes } from './crew/api';
import { scoreSighting } from './scoring';
import { resizedBase64 } from './prepareImage';
import { resolvePhoto } from './photoStore';
import { useJournalStore } from '@/state/useJournalStore';
import { dueForRetry, nextRetry, retryWaitMs } from './retry';

export { MAX_AUTO_RETRIES } from './retry';

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
      // No behavior multipliers for animals that could hurt someone: a bear with
      // cubs or a hunting predator must never be worth more for getting close
      // (App Store Guideline 1.4.1). Rarity still counts.
      sceneTags: outcome.dangerous ? [] : outcome.sceneTags,
      firstOfSpecies: priorSameSpecies === 0,
      priorSameSpecies,
      duplicatePhoto,
    });
    points = score.totalPoints;
  }

  updateSighting(id, {
    retry: undefined, // identified: any queue back-off is over
    species: outcome.species,
    sceneTags: outcome.sceneTags,
    caption: outcome.caption,
    // No human-review queue in the app yet, so a low-confidence "needs_review" would
    // sit "pending" forever. Treat it as a scored best guess (the confidence badge
    // conveys the uncertainty; the dispute flow handles corrections).
    idStatus: outcome.idStatus === 'needs_review' ? 'ai_confident' : outcome.idStatus,
    dangerous: outcome.dangerous,
    points,
    score,
    photoHash,
    source: outcome.source,
    note: outcome.note,
  });
  // Scout looks it up in the background (facts, other players' photos).
  // Best-effort; real AI results only.
  if (outcome.source !== 'mock' && outcome.eligible) fetchCrewNotes(id).catch(() => {});
}

let running = false;
// When the server says "not now" for everyone (too many requests, signed out),
// hold the whole queue until this time instead of knocking again every tick.
let pausedUntil = 0;

// Retries every queued (offline) capture. Safe to call often: it no-ops when
// there's nothing due or a run is already going, and leaves a capture queued
// if the device is still offline. `force` (the player asked) ignores waits.
export async function processAnalysisQueue(opts: { force?: boolean } = {}): Promise<void> {
  if (running || Platform.OS === 'web') return;
  if (opts.force) pausedUntil = 0;
  if (Date.now() < pausedUntil) return;
  running = true;
  try {
    const queued = useJournalStore
      .getState()
      .sightings.filter((s) => s.idStatus === 'queued' && (opts.force || dueForRetry(s.retry)));
    for (const s of queued) {
      const photoUri = resolvePhoto(s.photoUri);
      if (!photoUri) continue;
      // Downscale the stored photo before sending so a queued full-res capture
      // doesn't blow the request-size limit either.
      const base64 = await resizedBase64(photoUri);
      if (!base64) continue; // couldn't read/resize; leave it queued for next time
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
        const status = err instanceof OfflineError ? err.status : undefined;
        if (err instanceof OfflineError && status == null) break; // no connection: nothing will get through, retry later
        if (status === 401 || status === 429) {
          // Signed out, or asked to wait: not this capture's fault. Wait as
          // long as the server says (the rest of the day, when today's
          // allowance is used up) rather than sending the photo again each minute.
          pausedUntil = Date.now() + (status === 429 ? retryWaitMs((err as OfflineError).retryAfterS) : 2 * 60_000);
          break;
        }
        if (isPermanentFailure(err)) {
          // This photo can't be identified (unreadable or declined): stop trying.
          useJournalStore.getState().updateSighting(s.id, { idStatus: 'rejected', retry: undefined });
          continue;
        }
        // The server answered but couldn't identify this one. Wait longer
        // before trying it again, and move on to the next capture.
        useJournalStore.getState().updateSighting(s.id, { retry: nextRetry((s.retry?.attempts ?? 0) + 1) });
      }
    }
  } finally {
    running = false;
  }
}

// A capture whose identification was cut short (the app was closed while the
// "Identifying…" screen was up) would sit at "Identifying…" forever: the
// photo bytes it was waiting on lived in memory. Put it in the queue instead
// (its photo file is saved), or drop it when there's nothing left to identify
// it from. Skips anything recent enough to still be in flight.
export function recoverInterruptedCaptures(now = Date.now()): void {
  const { sightings, updateSighting, removeSighting } = useJournalStore.getState();
  for (const s of sightings) {
    if (s.idStatus !== 'identifying' || now - s.createdAt < 2 * 60_000) continue;
    if (Platform.OS !== 'web' && s.photoUri) updateSighting(s.id, { idStatus: 'queued' });
    else removeSighting(s.id);
  }
}

// The player asked to identify a queued capture now.
export function retryCaptureNow(): Promise<void> {
  return processAnalysisQueue({ force: true });
}
