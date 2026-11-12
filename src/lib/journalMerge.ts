// How the journal on the device and the journal in the cloud are brought
// together. Plain functions (no storage, no network), so the rules can be
// tested: see tests/journalMerge.test.ts. lib/journalSync.ts does the talking.
//
// The rules, in short:
//   - Scores, the species and "verified" belong to the server. What it sends
//     replaces what the device has.
//   - Field notes, a suggested species and the wall post belong to the player.
//     A change made on this device that hasn't been sent yet is never
//     overwritten by what the cloud has.
//   - A sighting is removed from the device only when the player deletes it,
//     or the cloud says outright that it was deleted. A sighting the cloud
//     doesn't mention is left alone.
import type { Sighting, IdStatus } from '@/types';
import type { ScoreBreakdown } from '../../shared/scoring';

// A row of the cloud journal, as the server sends it and as the app reads it
// from the table (public.journal_sightings).
export interface CloudRow {
  id: string;
  observed_at: string;
  logged_at: string;
  updated_at?: string;
  deleted_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  status: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon_group: string | null;
  confidence: number | null;
  scene_tags: string[] | null;
  caption: string | null;
  dangerous: boolean;
  points: number;
  score: ScoreBreakdown | null;
  verified: boolean;
  capture: 'camera' | 'library' | null;
  has_photo: boolean;
  science: Record<string, string[]> | null;
  proposed_species: string | null;
  wall_post_id: string | null;
}

// The columns the app reads (everything above; not the photo fingerprints or review notes).
export const CLOUD_COLUMNS =
  'id, observed_at, logged_at, updated_at, deleted_at, lat, lng, accuracy_m, status, common_name, scientific_name, taxon_group, confidence, scene_tags, caption, dangerous, points, score, verified, capture, has_photo, science, proposed_species, wall_post_id';

// Sightings that count: these are the ones kept in the cloud. Photos that
// didn't count (a pet, a person, nothing found) stay on the device only.
const COUNTED: ReadonlySet<string> = new Set(['ai_confident', 'needs_review', 'human_confirmed', 'disputed']);

export function belongsInCloud(s: Sighting): boolean {
  return COUNTED.has(s.idStatus) && Boolean(s.species?.scientificName) && s.source !== 'mock' && !s.cloudSkip;
}

// A change the player made here that the server hasn't had yet. Counted, not
// timed: a change made while a sync is in the air must not look "sent" just
// because the answer came back later than the tap.
export function hasUnsentEdit(s: Sighting): boolean {
  return (s.rev ?? 0) > (s.sentRev ?? 0);
}

// Has this sighting something the server hasn't seen?
export function needsPush(s: Sighting): boolean {
  if (!belongsInCloud(s)) return false;
  return !s.cloudAt || hasUnsentEdit(s);
}

// Field-note answers as lists (old journals may hold a single string).
function scienceLists(science: Record<string, unknown> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(science ?? {})) {
    const vals = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];
    if (vals.length) out[k] = vals;
  }
  return out;
}

// What to send for one sighting. A sighting the server already holds only
// needs the player's own additions; a new one needs the server's receipt or,
// for a sighting scored on the phone before journals moved to the cloud, what
// the phone knows about it.
export function pushItem(s: Sighting, groupOf: (s: Sighting) => string | undefined): Record<string, unknown> {
  const item: Record<string, unknown> = {
    id: s.id,
    science: scienceLists(s.science),
    ...(s.proposedSpecies ? { proposedSpecies: s.proposedSpecies } : {}),
    wallPostId: s.wallPostId ?? null,
  };
  if (s.cloudAt) return item;
  if (s.receipt) return { ...item, receipt: s.receipt };
  return {
    ...item,
    legacy: {
      observedAt: s.observedAt,
      loggedAt: s.createdAt,
      lat: s.lat,
      lng: s.lng,
      accuracyM: s.accuracyM,
      status: s.idStatus,
      common: s.species?.commonName,
      sci: s.species?.scientificName,
      group: groupOf(s),
      confidence: s.species?.confidence,
      tags: s.sceneTags,
      caption: s.caption,
      dangerous: s.dangerous === true,
      points: s.points ?? 0,
      score: s.score,
      capture: s.capture,
    },
  };
}

const toStatus = (status: string | null, proposed: string | null): IdStatus =>
  status === 'disputed' || proposed ? 'disputed' : status === 'human_confirmed' ? 'human_confirmed' : 'ai_confident';

// A sighting that exists only in the cloud (a new phone, a reinstall).
export function fromCloudRow(r: CloudRow, now: number): Sighting {
  return {
    id: r.id,
    createdAt: Date.parse(r.logged_at) || Date.parse(r.observed_at) || now,
    observedAt: Date.parse(r.observed_at) || now,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    accuracyM: r.accuracy_m ?? undefined,
    species: r.scientific_name
      ? { scientificName: r.scientific_name, commonName: r.common_name ?? r.scientific_name, confidence: r.confidence ?? 0, group: r.taxon_group ?? undefined }
      : undefined,
    sceneTags: r.scene_tags ?? [],
    caption: r.caption ?? undefined,
    idStatus: toStatus(r.status, r.proposed_species),
    points: r.points,
    score: r.score ?? undefined,
    dangerous: r.dangerous,
    proposedSpecies: r.proposed_species ?? undefined,
    source: 'ai',
    science: r.science ?? undefined,
    wallPostId: r.wall_post_id ?? undefined,
    capture: r.capture ?? undefined,
    cloudAt: now,
    verified: r.verified,
    cloudPhoto: r.has_photo,
    // Its photo is in the cloud, not on this device (see lib/cloudPhotos).
    photoUri: r.has_photo ? `cloud:${r.id}` : undefined,
  };
}

// Bring a sighting on the device up to date with its cloud row.
export function applyCloudRow(local: Sighting, r: CloudRow, now: number): Sighting {
  let next: Sighting = {
    ...local,
    cloudAt: local.cloudAt ?? now,
    verified: r.verified,
    cloudPhoto: r.has_photo,
    receipt: undefined, // the server has it now
    // No photo on this device, but the cloud has one: show that.
    photoUri: local.photoUri ?? (r.has_photo ? `cloud:${r.id}` : undefined),
  };
  // A capture this device never finished identifying (the app was closed, or
  // the answer was lost) that the server did record: complete it from the
  // cloud instead of identifying it again.
  if ((local.idStatus === 'identifying' || local.idStatus === 'queued' || !local.species) && r.scientific_name) {
    next = {
      ...next,
      species: { scientificName: r.scientific_name, commonName: r.common_name ?? r.scientific_name, confidence: r.confidence ?? 0, group: r.taxon_group ?? undefined },
      sceneTags: r.scene_tags ?? [],
      caption: r.caption ?? undefined,
      dangerous: r.dangerous,
      idStatus: toStatus(r.status, r.proposed_species),
      source: 'ai',
      retry: undefined,
    };
  }
  if (hasUnsentEdit(local)) return next; // the player changed it here since: send that first, then take the server's answer
  next = {
    ...next,
    cloudAt: now,
    // The player's own additions, as the cloud has them:
    science: r.science ?? undefined,
    proposedSpecies: r.proposed_species ?? local.proposedSpecies,
    wallPostId: r.wall_post_id ?? undefined,
    idStatus: toStatus(r.status, r.proposed_species),
  };
  // The score is the server's to decide for sightings it identified itself.
  // One it only has on the phone's word (scored here before scores moved to
  // the server) keeps the points the player has always seen in their journal;
  // what the server counts toward the leaderboard may be less.
  if (r.verified || typeof local.points !== 'number') {
    next.points = r.points;
    next.score = r.score ?? local.score;
  }
  return next;
}

export interface MergeResult {
  sightings: Sighting[];
  pendingDeletes: string[];
  added: number;
  removed: number;
}

// Fold rows read from the cloud into the journal on the device.
export function mergeRows(sightings: Sighting[], pendingDeletes: string[], rows: CloudRow[], now: number): MergeResult {
  const byId = new Map(sightings.map((s) => [s.id, s] as const));
  const waiting = new Set(pendingDeletes);
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    const local = byId.get(r.id);
    if (r.deleted_at) {
      // Deleted on another device (or already deleted there): gone here too.
      if (local) {
        byId.delete(r.id);
        removed++;
      }
      waiting.delete(r.id);
      continue;
    }
    if (waiting.has(r.id)) continue; // deleted here; the server just hasn't been told yet
    if (local) byId.set(r.id, applyCloudRow(local, r, now));
    else if (r.scientific_name) {
      byId.set(r.id, fromCloudRow(r, now));
      added++;
    }
  }
  // Keep the journal's order (newest first, as the app adds them); sightings new from the cloud go in by time.
  const kept = sightings.filter((s) => byId.has(s.id)).map((s) => byId.get(s.id)!);
  const fresh = [...byId.values()].filter((s) => !sightings.some((x) => x.id === s.id));
  const all = fresh.length ? [...kept, ...fresh].sort((a, b) => b.createdAt - a.createdAt) : kept;
  return { sightings: all, pendingDeletes: [...waiting], added, removed };
}

// The server's answer for one pushed sighting.
export type PushAnswer = CloudRow | { error: string } | { refused: string };

export function applyPushAnswer(local: Sighting, answer: PushAnswer, now: number): Sighting | null {
  if ('refused' in answer) {
    // The server's photo check says this one can't score.
    return { ...local, idStatus: 'ineligible', ineligibleReason: answer.refused, points: undefined, score: undefined, receipt: undefined, cloudSkip: true };
  }
  if ('error' in answer) return { ...local, cloudSkip: true }; // it will never be accepted: stop sending it
  if (answer.deleted_at) return null; // deleted elsewhere
  return applyCloudRow(local, answer, now);
}

// After a push: `sentRev` is the `rev` each sighting had when it was sent.
// The answer is applied in full only if the player hasn't changed the
// sighting again while the request was in the air.
export function applyPushAnswers(
  sightings: Sighting[],
  answers: Record<string, PushAnswer | undefined>,
  sentRevs: ReadonlyMap<string, number>,
  now: number,
): Sighting[] {
  return sightings.flatMap((s) => {
    const answer = answers[s.id];
    if (!answer || !sentRevs.has(s.id)) return [s];
    const next = applyPushAnswer({ ...s, sentRev: sentRevs.get(s.id) }, answer, now);
    return next ? [next] : [];
  });
}
