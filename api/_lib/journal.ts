// The cloud journal: recording sightings, scoring them, and keeping each
// player's leaderboard total. Everything that decides a score happens here,
// on the server; the app only shows the result.
//
// This file is logic only. It reads and writes through the small JournalDb
// interface (the real one, over Supabase, is in journalDb.ts), so the rules
// can be tested without a database: see tests/journal.test.ts.
import { createHash } from 'crypto';
import { applyFieldNotesBonus, MAX_TOTAL_POINTS, scoreSighting, type ScoreBreakdown } from '../../shared/scoring';
import { playerTotals, type QuestSighting } from '../../shared/quests';
import { ianaZone, isTimeZone } from '../../shared/zone';
import { cleanName, hasBlockedLanguage } from '../../shared/moderation';
import { SCENE_TAG_CODES, TAXON_GROUPS } from './identifyCore';
import { COPY_BITS, photoFingerprint, RESAVE_BITS, samePhoto } from './phash';
import { LIBRARY_HASHES } from './libraryHashes';
import { verifyReceipt, type ReceiptPayload } from './receipt';

// ---------- what is stored ----------
export type RowStatus = 'ai_confident' | 'needs_review' | 'disputed' | 'human_confirmed';
const STATUSES: readonly string[] = ['ai_confident', 'needs_review', 'disputed', 'human_confirmed'];

// One row of public.journal_sightings (supabase/migrations/0011_cloud_journal.sql).
export interface JournalRow {
  user_id: string;
  id: string;
  observed_at: string;
  logged_at: string;
  recorded_at?: string;
  updated_at?: string;
  deleted_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  status: RowStatus | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon_group: string | null;
  confidence: number | null;
  scene_tags: string[];
  caption: string | null;
  dangerous: boolean;
  points: number;
  /** For a phone-scored sighting: what the phone said it was worth. */
  claimed_points?: number | null;
  score: ScoreBreakdown | null;
  verified: boolean;
  capture: 'camera' | 'library' | null;
  flags: Record<string, unknown> | null;
  photo_sha: string | null;
  photo_phash: string | null;
  has_photo: boolean;
  science: Record<string, string[]> | null;
  proposed_species: string | null;
  wall_post_id: string | null;
  model: string | null;
}

export interface JournalState {
  user_id: string;
  tz: string | null;
  ready_at: string | null;
  baseline_points: number;
  carryover_points: number;
  legacy_points: number;
}

// A fingerprint of some stored sighting, for the copy check.
export interface Print {
  user_id: string;
  id: string;
  photo_sha: string | null;
  photo_phash: string | null;
}

// Storage the rules need. Methods throw JournalUnavailable when the database
// can't be used (unreachable, or migration 0011 hasn't been run).
export interface JournalDb {
  getRow(uid: string, sid: string): Promise<JournalRow | null>;
  /** The account's live (not deleted) sightings. */
  liveRows(uid: string): Promise<JournalRow[]>;
  /** How many sightings of this species the account has ever recorded, deleted ones included, other than `exceptSid`. */
  speciesCount(uid: string, sci: string, exceptSid: string): Promise<number>;
  /** Stored fingerprints that could be the same picture: any account's sightings of this species, plus any with this exact hash. */
  lookAlikes(sci: string, sha: string | null): Promise<Print[]>;
  /** False when a row with this account and id already exists. */
  insertRow(row: JournalRow): Promise<boolean>;
  updateRow(uid: string, sid: string, patch: Partial<JournalRow>): Promise<void>;
  getState(uid: string): Promise<JournalState | null>;
  saveState(uid: string, patch: Partial<Omit<JournalState, 'user_id'>>): Promise<void>;
  profilePoints(uid: string): Promise<number | null>;
  setProfileTotals(uid: string, points: number, speciesCount: number): Promise<void>;
  /** When the legacy window closes (ms), or null if it isn't set. */
  legacyUntil(): Promise<number | null>;
  putPhoto(uid: string, sid: string, bytes: Buffer, contentType: string): Promise<boolean>;
  removePhotos(uid: string, sids: string[]): Promise<void>;
}

export class JournalUnavailable extends Error {}

// ---------- limits ----------
// Points carried over from before the switch (see ensureReady) and points
// accepted from phone-scored sightings (see importLegacy) are both capped:
// they rest on what an app claimed, so they are bounded and reviewable.
export const MAX_CARRYOVER = 10_000;
export const MAX_LEGACY_POINTS = 20_000;
// A journal this large isn't a person's.
export const MAX_ROWS = 5_000;
const MAX_FIELD_NOTES = 6;
// Deletion markers made for sightings the server never saw (see deleteSightings), per request.
const MAX_NEW_MARKERS = 20;
const SID = /^[A-Za-z0-9_-]{6,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COPY_MESSAGES = {
  copied: 'This photo has already been logged by another explorer. Only photos you take yourself can score.',
  library: 'This is one of Scout’s own photos. Only photos you take yourself can score.',
} as const;

export const IMPORT_MESSAGE =
  'We couldn’t confirm this is a photo you took: it doesn’t carry the details a camera saves (it may be a screenshot or a saved picture). Photos taken with the ClipIt camera always count.';

// ---------- small helpers ----------
const iso = (ms: number) => new Date(ms).toISOString();
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function validSightingId(v: unknown): v is string {
  return typeof v === 'string' && SID.test(v);
}

// A time the app sent: sane (not far future, not before the app existed), else the fallback.
function saneTime(v: unknown, fallback: number, now: number): number {
  const t = num(v);
  return t != null && t > Date.UTC(2015, 0, 1) && t < now + 86_400_000 ? t : fallback;
}

function saneCoord(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } {
  const a = num(lat);
  const b = num(lng);
  return a != null && b != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : { lat: null, lng: null };
}

// The player's field-note answers: a few short keys, each with a few short
// values. Anything else is dropped (the answers earn a small bonus, so their
// number is bounded).
export function cleanScience(v: unknown): Record<string, string[]> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, string[]> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_FIELD_NOTES) break;
    if (!/^[A-Za-z_]{1,24}$/.test(k)) continue;
    const vals = (Array.isArray(raw) ? raw : [raw]).filter((x): x is string => typeof x === 'string' && /^[\w .,+<>=-]{1,40}$/.test(x)).slice(0, 8);
    if (vals.length) out[k] = vals;
  }
  return Object.keys(out).length ? out : null;
}

function toQuestSighting(r: JournalRow): QuestSighting {
  return {
    idStatus: r.status ?? 'rejected',
    points: r.points,
    observedAt: Date.parse(r.observed_at),
    species: r.scientific_name ? { scientificName: r.scientific_name, commonName: r.common_name ?? r.scientific_name, group: r.taxon_group ?? undefined } : undefined,
    sceneTags: r.scene_tags ?? [],
    science: r.science ?? undefined,
    score: r.score ? { basePoints: r.score.basePoints } : undefined,
  };
}

// ---------- totals ----------
export interface Totals {
  points: number;
  speciesCount: number;
}

// What the account's score is, from its live sightings: sighting points plus
// quest rewards, worked out in the player's own time zone (weekly quests run
// Monday to Sunday there), plus what is still carried over from before the
// switch to server-kept scores.
//
// The carry-over: at the switch the leaderboard showed `baseline_points`,
// reported by the phone. So that nobody's score drops, whatever part of that
// the uploaded phone-scored sightings don't account for is added on. As those
// sightings arrive (from this device or another) it shrinks by what they are
// worth, so nothing is counted twice; and it never grows back, so deleting a
// sighting still lowers the score.
export async function computeTotals(jdb: JournalDb, uid: string, state: JournalState | null, now = Date.now()): Promise<Totals & { carryover: number }> {
  const rows = await jdb.liveRows(uid);
  const zone = ianaZone(state && isTimeZone(state.tz) ? state.tz : 'UTC');
  const all = playerTotals(rows.map(toQuestSighting), { seed: uid, zone, now });
  const fromPhone = playerTotals(rows.filter((r) => !r.verified).map(toQuestSighting), { seed: uid, zone, now });
  const carryover = state ? Math.min(state.carryover_points, Math.max(0, state.baseline_points - fromPhone.points)) : 0;
  return { points: all.points + carryover, speciesCount: all.speciesCount, carryover };
}

// Write the account's score to the leaderboard. Only once the account has
// switched to server-kept scores (ready_at); until then the phone's own
// number stands.
export async function refreshTotals(jdb: JournalDb, uid: string, now = Date.now()): Promise<Totals | null> {
  const state = await jdb.getState(uid);
  if (!state?.ready_at) return null;
  const { carryover, ...totals } = await computeTotals(jdb, uid, state, now);
  if (carryover !== state.carryover_points) await jdb.saveState(uid, { carryover_points: carryover });
  await jdb.setProfileTotals(uid, Math.min(totals.points, 5_000_000), totals.speciesCount);
  return totals;
}

// Remember the player's time zone (sent by the app with each request).
export async function noteTimeZone(jdb: JournalDb, uid: string, tz: unknown): Promise<void> {
  if (!isTimeZone(tz)) return;
  const state = await jdb.getState(uid);
  if (state?.tz !== tz) await jdb.saveState(uid, { tz });
}

// ---------- recording a sighting the server identified ----------
export type RecordOutcome =
  | { kind: 'recorded'; row: JournalRow; created: boolean }
  | { kind: 'refused'; reason: keyof typeof COPY_MESSAGES; message: string };

// `p` is what the identify endpoint saw, either straight from it or from a
// receipt it signed. Safe to call twice for the same sighting: the second
// call returns the row the first one wrote.
export async function recordSighting(jdb: JournalDb, p: ReceiptPayload, photoBase64?: string | null): Promise<RecordOutcome> {
  // Already recorded (a retry), or already deleted by the player (the photo
  // was still being identified when they cancelled): nothing more to do.
  const existing = await jdb.getRow(p.uid, p.sid);
  if (existing) return { kind: 'recorded', row: existing, created: false };

  // Is this picture already known?
  const print = { sha: p.sha, phash: p.phash };
  if (Object.values(LIBRARY_HASHES).some((h) => samePhoto(print, { phash: h }, COPY_BITS))) {
    return { kind: 'refused', reason: 'library', message: COPY_MESSAGES.library };
  }
  let duplicatePhoto = false;
  for (const other of await jdb.lookAlikes(p.id.sci, p.sha)) {
    const theirs = { sha: other.photo_sha, phash: other.photo_phash };
    if (other.user_id !== p.uid) {
      // Someone else logged this picture first.
      if (samePhoto(print, theirs, COPY_BITS)) return { kind: 'refused', reason: 'copied', message: COPY_MESSAGES.copied };
    } else if (other.id !== p.sid && samePhoto(print, theirs, RESAVE_BITS)) {
      duplicatePhoto = true; // the player's own photo again: recorded, worth nothing
    }
  }

  // Earlier sightings of the species, deleted ones included (so deleting and
  // re-adding can't bring back the first-time bonus).
  const priorSameSpecies = await jdb.speciesCount(p.uid, p.id.sci, p.sid);
  const score = scoreSighting({
    rarityScore: p.id.rarity,
    // No behaviour multipliers for animals that could hurt someone: getting
    // close to a bear with cubs must never be worth more.
    sceneTags: p.id.dangerous ? [] : p.id.tags,
    firstOfSpecies: priorSameSpecies === 0,
    priorSameSpecies,
    duplicatePhoto,
  });

  const where = saneCoord(p.lat, p.lng);
  const row: JournalRow = {
    user_id: p.uid,
    id: p.sid,
    observed_at: iso(p.observedAt),
    logged_at: iso(p.loggedAt),
    deleted_at: null,
    lat: where.lat,
    lng: where.lng,
    accuracy_m: where.lat != null ? num(p.accuracyM) : null,
    status: p.id.status,
    common_name: p.id.common,
    scientific_name: p.id.sci,
    taxon_group: p.id.group,
    confidence: p.id.confidence,
    scene_tags: p.id.tags,
    caption: p.id.caption || null,
    dangerous: p.id.dangerous,
    points: score.totalPoints,
    score,
    verified: true,
    capture: p.capture,
    flags: p.flags,
    photo_sha: p.sha,
    photo_phash: p.phash,
    has_photo: false,
    science: null,
    proposed_species: null,
    wall_post_id: null,
    model: p.model,
  };
  if (!(await jdb.insertRow(row))) {
    // Another request for the same sighting got there first.
    const now = await jdb.getRow(p.uid, p.sid);
    if (now) return { kind: 'recorded', row: now, created: false };
    throw new JournalUnavailable('sighting could not be written');
  }
  await storePhoto(jdb, row, photoBase64);
  return { kind: 'recorded', row, created: true };
}

// Keep a copy of the photo with the sighting. For a sighting the server
// identified, only the picture it identified is accepted: the same bytes, or
// (when the app sends it later, resized again) one whose look-alike
// fingerprint says it is the same picture.
async function storePhoto(jdb: JournalDb, row: JournalRow, photoBase64: string | null | undefined): Promise<void> {
  if (!photoBase64 || row.has_photo || row.deleted_at) return;
  const bytes = Buffer.from(photoBase64, 'base64');
  if (bytes.length < 100 || bytes.length > 2_400_000) return;
  const type = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : null;
  if (!type) return;
  if (row.verified) {
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== row.photo_sha && !samePhoto(photoFingerprint(photoBase64), { phash: row.photo_phash }, COPY_BITS)) return;
  }
  if (await jdb.putPhoto(row.user_id, row.id, bytes, type)) {
    await jdb.updateRow(row.user_id, row.id, { has_photo: true });
    row.has_photo = true;
  }
}

// ---------- a sighting the phone scored before this change ----------
export interface LegacyClaim {
  observedAt?: unknown;
  loggedAt?: unknown;
  lat?: unknown;
  lng?: unknown;
  accuracyM?: unknown;
  status?: unknown;
  common?: unknown;
  sci?: unknown;
  group?: unknown;
  confidence?: unknown;
  tags?: unknown;
  caption?: unknown;
  dangerous?: unknown;
  points?: unknown;
  score?: unknown;
  capture?: unknown;
}

function cleanScore(v: unknown, points: number): ScoreBreakdown | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, any>;
  const n = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, lo, hi) : d);
  const b = s.bonuses && typeof s.bonuses === 'object' ? s.bonuses : {};
  return {
    basePoints: n(s.basePoints, 1, 30, 1),
    behaviorMultiplier: n(s.behaviorMultiplier, 1, 8, 1),
    repeatMultiplier: n(s.repeatMultiplier, 0, 1, 1),
    bonuses: { firstOfSpecies: n(b.firstOfSpecies, 0, 5, 0), quest: 0, streak: 0, fieldNotes: n(b.fieldNotes, 0, MAX_FIELD_NOTES, 0) },
    totalPoints: points,
    ruleVersion: typeof s.ruleVersion === 'string' ? s.ruleVersion.slice(0, 20) : 'legacy',
  };
}

export type ImportOutcome = { kind: 'recorded'; row: JournalRow; created: boolean } | { kind: 'invalid'; error: string };

// These rest on what the app says, so they are accepted with their points
// only during the legacy window (and up to a cap per account), are marked
// `verified: false`, and are stored with no points at all after it.
export async function importLegacy(
  jdb: JournalDb,
  uid: string,
  sid: string,
  claim: LegacyClaim,
  photoBase64?: string | null,
  now = Date.now(),
): Promise<ImportOutcome> {
  const existing = await jdb.getRow(uid, sid);
  if (existing) return { kind: 'recorded', row: existing, created: false };

  const sci = cleanName(claim.sci, 80);
  const common = cleanName(claim.common, 80) ?? sci;
  if (!sci || !common) return { kind: 'invalid', error: 'a sighting needs a species name' };
  if (typeof claim.status !== 'string' || !STATUSES.includes(claim.status)) return { kind: 'invalid', error: 'not a sighting that counts' };

  const state = await jdb.getState(uid);
  const until = await jdb.legacyUntil();
  const used = state?.legacy_points ?? 0;
  const open = until != null && now < until && used < MAX_LEGACY_POINTS;
  const claimed = typeof claim.points === 'number' && Number.isFinite(claim.points) ? Math.round(claim.points) : 0;
  const points = open ? clamp(Math.min(claimed, MAX_LEGACY_POINTS - used), 0, MAX_TOTAL_POINTS) : 0;

  const observedAt = saneTime(claim.observedAt, now, now);
  const where = saneCoord(claim.lat, claim.lng);
  const caption = typeof claim.caption === 'string' ? claim.caption.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  const print = photoBase64 ? photoFingerprint(photoBase64) : { sha: null, phash: null };
  const row: JournalRow = {
    user_id: uid,
    id: sid,
    observed_at: iso(observedAt),
    logged_at: iso(saneTime(claim.loggedAt, observedAt, now)),
    deleted_at: null,
    lat: where.lat,
    lng: where.lng,
    accuracy_m: where.lat != null ? num(claim.accuracyM) : null,
    status: claim.status as RowStatus,
    common_name: common,
    scientific_name: sci,
    taxon_group: (TAXON_GROUPS as readonly unknown[]).includes(claim.group) ? (claim.group as string) : null,
    confidence: typeof claim.confidence === 'number' && Number.isFinite(claim.confidence) ? clamp(claim.confidence, 0, 1) : null,
    scene_tags: Array.isArray(claim.tags) ? [...new Set(claim.tags.filter((t): t is string => (SCENE_TAG_CODES as readonly unknown[]).includes(t)))] : [],
    caption: caption && !hasBlockedLanguage(caption) ? caption : null,
    dangerous: claim.dangerous === true,
    points,
    claimed_points: clamp(claimed, 0, MAX_TOTAL_POINTS),
    score: points > 0 ? cleanScore(claim.score, points) : null,
    verified: false,
    capture: claim.capture === 'camera' || claim.capture === 'library' ? claim.capture : null,
    flags: null,
    photo_sha: print.sha,
    photo_phash: print.phash,
    has_photo: false,
    science: null,
    proposed_species: null,
    wall_post_id: null,
    model: null,
  };
  if (!(await jdb.insertRow(row))) {
    const now2 = await jdb.getRow(uid, sid);
    if (now2) return { kind: 'recorded', row: now2, created: false };
    throw new JournalUnavailable('sighting could not be written');
  }
  if (points > 0) await jdb.saveState(uid, { legacy_points: used + points });
  await storePhoto(jdb, row, photoBase64);
  return { kind: 'recorded', row, created: true };
}

// ---------- the player's own additions to a sighting ----------
export interface Edits {
  science?: unknown;
  proposedSpecies?: unknown;
  wallPostId?: unknown;
}

// Field-note answers (which earn a small bonus), a suggested species, and
// which wall post shares the sighting. Returns the row as it now stands.
export async function applyEdits(jdb: JournalDb, row: JournalRow, edits: Edits): Promise<JournalRow> {
  if (row.deleted_at) return row;
  const patch: Partial<JournalRow> = {};
  if (edits.science !== undefined) {
    const science = cleanScience(edits.science);
    if (JSON.stringify(science) !== JSON.stringify(row.science ?? null)) {
      patch.science = science;
      if (row.score) {
        const next = applyFieldNotesBonus(row.score, science ? Object.keys(science).length : 0);
        patch.score = next.score;
        patch.points = next.points;
      }
    }
  }
  if (edits.proposedSpecies !== undefined) {
    const proposed = cleanName(edits.proposedSpecies, 80);
    if (proposed && proposed !== row.proposed_species) {
      patch.proposed_species = proposed;
      patch.status = 'disputed';
    }
  }
  if (edits.wallPostId !== undefined) {
    const post = typeof edits.wallPostId === 'string' && UUID.test(edits.wallPostId) ? edits.wallPostId : null;
    if (post !== row.wall_post_id) patch.wall_post_id = post;
  }
  if (!Object.keys(patch).length) return row;
  await jdb.updateRow(row.user_id, row.id, patch);
  return { ...row, ...patch };
}

// ---------- deleting ----------
// The row stays as a marker (so the player's other devices drop the sighting
// instead of uploading it again), emptied of everything personal. The species
// and the photo's fingerprints are kept: they stop the same photo scoring
// again for anyone, and stop delete-and-re-add from resetting a species.
export async function deleteSightings(jdb: JournalDb, uid: string, sids: string[], now = Date.now()): Promise<string[]> {
  const gone: string[] = [];
  const hadPhoto: string[] = [];
  let newMarkers = 0;
  for (const sid of sids) {
    const row = await jdb.getRow(uid, sid);
    if (!row) {
      // The server has never seen this sighting. It may be on its way (the
      // player cancelled while the photo was still being identified): leave a
      // marker, so that when it arrives it is not recorded after all.
      if (newMarkers++ < MAX_NEW_MARKERS) await jdb.insertRow(deletionMarker(uid, sid, now));
      gone.push(sid);
      continue;
    }
    if (!row.deleted_at) {
      await jdb.updateRow(uid, sid, {
        deleted_at: iso(now), status: null, common_name: null, lat: null, lng: null, accuracy_m: null, caption: null, points: 0, claimed_points: null, score: null,
        science: null, proposed_species: null, wall_post_id: null, flags: null, has_photo: false, confidence: null, scene_tags: [],
      });
      hadPhoto.push(sid);
    }
    gone.push(sid);
  }
  if (hadPhoto.length) await jdb.removePhotos(uid, hadPhoto);
  return gone;
}

function deletionMarker(uid: string, sid: string, now: number): JournalRow {
  return {
    user_id: uid, id: sid, observed_at: iso(now), logged_at: iso(now), deleted_at: iso(now), lat: null, lng: null, accuracy_m: null, status: null,
    common_name: null, scientific_name: null, taxon_group: null, confidence: null, scene_tags: [], caption: null, dangerous: false, points: 0, score: null,
    verified: false, capture: null, flags: null, photo_sha: null, photo_phash: null, has_photo: false, science: null, proposed_species: null,
    wall_post_id: null, model: null,
  };
}

// ---------- the switch to server-kept scores ----------
// An account switches the first time an updated app syncs. The server decides
// this, not the app: a device with an empty journal (the web app, a second
// phone) must not be able to declare "that's everything" and have the rest
// counted twice when it arrives. What the leaderboard showed at that moment
// is remembered as the baseline; see computeTotals for how it is carried over.
export async function ensureReady(jdb: JournalDb, uid: string, now = Date.now()): Promise<void> {
  const state = await jdb.getState(uid);
  if (state?.ready_at) return;
  const baseline = clamp((await jdb.profilePoints(uid)) ?? 0, 0, MAX_CARRYOVER);
  await jdb.saveState(uid, { ready_at: iso(now), baseline_points: baseline, carryover_points: baseline });
}

// ---------- the sync endpoint's work ----------
export interface SyncItem {
  id?: unknown;
  receipt?: unknown;
  legacy?: LegacyClaim;
  photoBase64?: unknown;
  science?: unknown;
  proposedSpecies?: unknown;
  wallPostId?: unknown;
}

export interface SyncBody {
  tz?: unknown;
  items?: unknown;
  deletes?: unknown;
}

export type SyncRow = JournalRow | { error: string } | { refused: string };

export interface SyncResult {
  rows: Record<string, SyncRow>;
  deleted: string[];
  totals: Totals | null;
  ready: boolean;
  legacyOpen: boolean;
}

export const MAX_SYNC_ITEMS = 40;
export const MAX_SYNC_DELETES = 100;

export async function syncJournal(jdb: JournalDb, uid: string, body: SyncBody, now = Date.now()): Promise<SyncResult> {
  await noteTimeZone(jdb, uid, body.tz);
  await ensureReady(jdb, uid, now);

  const deletes = Array.isArray(body.deletes) ? body.deletes.filter(validSightingId).slice(0, MAX_SYNC_DELETES) : [];
  const deleted = deletes.length ? await deleteSightings(jdb, uid, deletes, now) : [];

  const rows: Record<string, SyncRow> = {};
  const items = Array.isArray(body.items) ? (body.items as SyncItem[]).slice(0, MAX_SYNC_ITEMS) : [];
  let liveCount: number | null = null;
  for (const item of items) {
    if (!item || !validSightingId(item.id)) continue;
    const sid = item.id;
    const photo = typeof item.photoBase64 === 'string' && item.photoBase64.length < 3_200_000 ? item.photoBase64 : null;
    let row = await jdb.getRow(uid, sid);
    if (!row) {
      const receipt = verifyReceipt(item.receipt, uid, sid, now);
      if (receipt) {
        const out = await recordSighting(jdb, receipt, photo);
        if (out.kind === 'refused') {
          rows[sid] = { refused: out.message };
          continue;
        }
        row = out.row;
      } else if (item.legacy && typeof item.legacy === 'object') {
        liveCount ??= (await jdb.liveRows(uid)).length;
        if (liveCount >= MAX_ROWS) {
          rows[sid] = { error: 'journal is full' };
          continue;
        }
        const out = await importLegacy(jdb, uid, sid, item.legacy, photo, now);
        if (out.kind === 'invalid') {
          rows[sid] = { error: out.error };
          continue;
        }
        row = out.row;
        if (out.created) liveCount++;
      } else {
        rows[sid] = { error: 'nothing to record' };
        continue;
      }
    } else if (photo && !row.has_photo && !row.deleted_at) {
      // The row exists but its photo never arrived (the upload failed last time).
      await storePhoto(jdb, row, photo);
    }
    rows[sid] = await applyEdits(jdb, row, item);
  }

  const totals = await refreshTotals(jdb, uid, now);
  const until = await jdb.legacyUntil();
  return { rows, deleted, totals, ready: totals !== null, legacyOpen: until != null && now < until };
}
