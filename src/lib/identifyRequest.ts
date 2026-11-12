// What is sent to the identify endpoint with a photo.
//
// Normally: the photo and nothing else. The server identifies it, keeps
// nothing, and the answer is the same one the app has always had.
//
// Only when the sighting is going to be saved to the player's account (they
// agreed to that, and the age question is settled: lib/journalSync decides)
// does the request also say which sighting it is, whose, when it was taken
// and how, and, if the player saves places, roughly where: to two decimals,
// about a kilometre. The exact spot never leaves the phone.
//
// A plain function (no app imports), so that can be tested: tests/identifyRequest.test.ts.
import type { PhotoEvidence } from '../../shared/photoEvidence';
import { approxPlace } from '../../shared/place';

export interface SightingDetails {
  sightingId?: string;
  account?: string;
  observedAt?: number;
  loggedAt?: number;
  tz?: string;
  lat?: number;
  lng?: number;
  /** Taken with the in-app camera, or uploaded from the camera roll. */
  capture?: 'camera' | 'library';
  /** For an upload: whether the photo carries a camera's details. */
  evidence?: PhotoEvidence;
}

export function identifyRequestBody(photoBase64: string, d: SightingDetails = {}): Record<string, unknown> {
  const photo = { imageBase64: photoBase64, mediaType: 'image/jpeg' };
  if (!d.sightingId || !d.account) return photo;
  return {
    ...photo,
    sightingId: d.sightingId,
    account: d.account,
    observedAt: d.observedAt,
    loggedAt: d.loggedAt,
    tz: d.tz,
    capture: d.capture,
    evidence: d.evidence,
    ...(approxPlace(d.lat, d.lng) ?? {}),
  };
}
