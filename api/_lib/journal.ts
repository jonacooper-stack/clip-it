// The cloud journal: recording sightings, scoring them, and keeping each
// player's leaderboard total. Everything that decides a score happens here,
// on the server; the app only shows the result.
//
// This file is logic only. It reads and writes through the small JournalDb
// interface (the real one, over Supabase, is in journalDb.ts), so the rules
// can be tested without a database: see tests/journal.test.ts.
//
// What the rules assume about the caller: nothing. The app's public key ships
// inside the app, so every request may come from a script. A score can only
// come from (a) a photo this server identified itself, or (b) for accounts
// that existed before scores moved to the server, a bounded allowance fixed
// by the database when the migration ran.
import { createHash } from 'crypto';
import { applyFieldNotesBonus, MAX_TOTAL_POINTS, scoreSighting, type ScoreBreakdown } from '../../shared/scoring';
import { playerTotals, type QuestSighting } from '../../shared/quests';
import { canonicalTimeZone, ianaZone } from '../../shared/zone';
import { cleanName, hasBlockedLanguage, tidyName } from '../../shared/moderation';
import { cleanFieldNotes } from '../../shared/fieldNotes';
import { SCENE_TAG_CODES, TAXON_GROUPS } from './identifyCore';
import { samePhoto, type Print } from './phash';
import { LIBRARY_PRINTS } from './libraryHashes';
import { verifyReceipt, type ReceiptPayload } from './receipt';
import { stripJpegMetadata } from './jpegStrip';
import { approxPlace } from '../../shared/place';

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
  /** Where it was taken, to two decimals, if the player saves places. */
  lat: number | null;
  lng: number | null;
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
  /** The photo's fingerprints (see phash.ts): the hash of its bytes, and the two parts of the look-alike one. */
  photo_sha: string | null;
  photo_phash: string | null;
  photo_mask: string | null;
  has_photo: boolean;
  science: Record<string, string[]> | null;
  proposed_species: string | null;
  wall_post_id: string | null;
  model: string | null;
}

// What the owner's app is sent: the row without the server's own notes
// (review flags, photo fingerprints, which model answered).
export type PublicRow = Omit<JournalRow, 'flags' | 'photo_sha' | 'photo_phash' | 'photo_mask' | 'model' | 'claimed_points'>;
export function publicRow(r: JournalRow): PublicRow {
  const { flags: _f, photo_sha: _s, photo_phash: _p, photo_mask: _k, model: _m, claimed_points: _c, ...rest } = r;
  return rest;
}

export interface JournalState {
  user_id: string;
  tz: string | null;
  ready_at: string | null;
  /** What the leaderboard showed for this account when the migration ran (fixed by the database, capped). */
  baseline_points: number;
  /** How much of that baseline the uploaded journal doesn't account for yet. Only ever shrinks. */
  carryover_points: number;
  /** The most that phone-scored sightings may add to this account's score (fixed by the database). */
  legacy_allowance: number;
  /** The player's answer to "save my journal to my account". Nothing is stored unless it is 'yes'. */
  backup: 'yes' | 'no' | null;
  /** Whether a sighting's (approximate) place is stored with it. Anything but true means no. */
  save_places: boolean | null;
  /** When everything saved to the journal was last deleted at the player's request. */
  erased_at: string | null;
}

// The account's two choices, as the app is told them.
export interface Prefs {
  backup: 'yes' | 'no' | null;
  /** Places are saved with the journal (only ever true by the player's choice, or an adult's default once they allow location). */
  places: boolean;
  /** The places choice has been made (either way); false: nobody has chosen yet, which counts as off. */
  placesSet: boolean;
  /** Changes when the saved journal is erased: a device that synced before must send its sightings afresh. */
  epoch: string | null;
}

// A stored picture that is, or looks like, the one being recorded.
export interface Match {
  source: 'journal' | 'wall';
  user_id: string;
  ref: string; // the sighting id, or the wall post id
  exact: boolean; // the very same bytes (otherwise: the look-alike fingerprints say it is the same picture)
}

export interface Refusal {
  user_id: string;
  sighting_id: string;
  reason: string;
  matched_user?: string | null;
  matched_ref?: string | null;
}

// Storage the rules need. Methods throw JournalUnavailable when the database
// can't be used (unreachable, or migration 0011 hasn't been run).
export interface JournalDb {
  getRow(uid: string, sid: string): Promise<JournalRow | null>;
  /** The account's live (not deleted) sightings. */
  liveRows(uid: string): Promise<JournalRow[]>;
  /** Every row the account has, deletion markers included. */
  countRows(uid: string): Promise<number>;
  /** How many sightings of this species the account has ever recorded, deleted ones included, other than `exceptSid`. */
  speciesCount(uid: string, sci: string, exceptSid: string): Promise<number>;
  /**
   * Stored pictures that are, or look like, this one: sightings the server
   * identified (any account), wall photos (any account), and this account's
   * own sightings of any kind. Compared in the database, over everything,
   * flipped left to right as well as not.
   */
  lookAlikes(uid: string, print: Print): Promise<Match[]>;
  /** False when a row with this account and id already exists. */
  insertRow(row: JournalRow): Promise<boolean>;
  updateRow(uid: string, sid: string, patch: Partial<JournalRow>): Promise<void>;
  getState(uid: string): Promise<JournalState | null>;
  saveState(uid: string, patch: Partial<Omit<JournalState, 'user_id'>>): Promise<void>;
  setProfileTotals(uid: string, points: number, speciesCount: number): Promise<void>;
  /** Put a sighting's points and species on the wall post that shares it (the account's own post only). */
  setWallPostFacts(uid: string, postId: string, facts: { points: number; common_name: string | null; scientific_name: string | null }): Promise<void>;
  /** When the legacy window closes (ms), or null while no date has been set (the window is then open). */
  legacyUntil(): Promise<number | null>;
  putPhoto(uid: string, sid: string, bytes: Buffer): Promise<boolean>;
  /** Remove stored photos. False if storage didn't confirm they are gone. */
  removePhotos(uid: string, sids: string[]): Promise<boolean>;
  /** Note on these rows that their stored photo is gone. */
  clearPhotoFlags(uid: string, sids: string[]): Promise<void>;
  /** Remove every stored photo of the account (account deletion, erasing the journal). */
  purgePhotos(uid: string): Promise<void>;
  /** Forget where the account's sightings were taken (the player stopped saving places). */
  clearPlaces(uid: string): Promise<void>;
  /** Remove every journal row and refusal note of the account (not its state). */
  deleteJournal(uid: string): Promise<void>;
  /** Keep a record of a photo that was turned down as a copy, so a wrong call can be put right. */
  logRefusal(entry: Refusal): Promise<void>;
  /** Take the account's lock for up to `seconds`; false if another request holds it. */
  tryLock(uid: string, seconds: number): Promise<boolean>;
  unlock(uid: string): Promise<void>;
}

export class JournalUnavailable extends Error {}
// The account's journal is busy with another request and didn't free up in time.
export class JournalBusy extends Error {}

// ---------- limits ----------
// A journal this large isn't a person's (deletion markers count too).
export const MAX_ROWS = 20_000;
// Deletion markers made for sightings the server never saw (see deleteSightings), per request.
const MAX_NEW_MARKERS = 20;
// The copy kept with a sighting: the app sends a JPEG of 150–400 KB.
const MAX_PHOTO_BYTES = 700_000;
// Sightings scored on a phone can't be older than the app.
const APP_START = Date.UTC(2026, 5, 1);
const SID = /^[A-Za-z0-9_-]{6,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

export const COPY_MESSAGES = {
  copied: 'This photo has already been logged by another explorer. Only photos you take yourself can score.',
  library: 'This is one of Scout’s own photos. Only photos you take yourself can score.',
  unchecked: 'We couldn’t check this photo, so it can’t score. Try taking it again with the ClipIt camera.',
} as const;

export const IMPORT_MESSAGE =
  'We couldn’t confirm this is a photo you took: it doesn’t carry the details a camera saves (it may be a screenshot or a saved picture). Photos you take with the ClipIt camera are never turned down for this.';

// ---------- small helpers ----------
const iso = (ms: number) => new Date(ms).toISOString();
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function validSightingId(v: unknown): v is string {
  return typeof v === 'string' && SID.test(v);
}

// A time the app sent: sane (not in the future, not absurdly old), else the fallback.
function saneTime(v: unknown, fallback: number, now: number, earliest = Date.UTC(2000, 0, 1)): number {
  const t = num(v);
  return t != null && t >= earliest && t < now + 86_400_000 ? t : fallback;
}

// The place to store: only if the player saves places, and then only to two
// decimals (the exact spot never reaches the database, whatever was sent).
function placeToStore(lat: unknown, lng: unknown, savePlaces: boolean): { lat: number | null; lng: number | null } {
  return (savePlaces ? approxPlace(lat, lng) : null) ?? { lat: null, lng: null };
}

// One request at a time per account. Recording a sighting reads the journal
// (has this photo been seen? how many of this species?) and then writes to
// it; two requests doing that at once would both see "first of its species".
export async function withJournalLock<T>(jdb: JournalDb, uid: string, waitMs: number, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (await jdb.tryLock(uid, 15)) break;
    if (Date.now() >= deadline) throw new JournalBusy('journal busy');
    await new Promise((r) => setTimeout(r, 120));
  }
  try {
    return await fn();
  } finally {
    await jdb.unlock(uid).catch(() => {}); // the lock also expires by itself
  }
}

// ---------- totals ----------
export interface Totals {
  points: number;
  speciesCount: number;
}

// A row as the quest rules see it. A sighting counts in the week it was
// taken, unless it was handed in more than a week after that: then it counts
// when it was handed in. (Otherwise old dates on photos could be used to
// complete weekly quests for weeks long gone.)
function toQuestSighting(r: JournalRow): QuestSighting {
  const observed = Date.parse(r.observed_at);
  const recorded = r.recorded_at ? Date.parse(r.recorded_at) : observed;
  return {
    idStatus: r.status ?? 'rejected',
    points: r.points,
    observedAt: r.verified && recorded - observed > 7 * 86_400_000 ? recorded : observed,
    species: r.scientific_name ? { scientificName: r.scientific_name, commonName: r.common_name ?? r.scientific_name, group: r.taxon_group ?? undefined } : undefined,
    sceneTags: r.scene_tags ?? [],
    science: r.science ?? undefined,
    score: r.score ? { basePoints: r.score.basePoints } : undefined,
  };
}

// What the account's score is: sighting points plus quest rewards, worked out
// in the player's own time zone (weekly quests run Monday to Sunday there).
//
// Only sightings that are worth something count, toward quests and species
// as well as points. One worth nothing (the player's own photo handed in
// again, or a phone-scored sighting that arrived after the cut-off) is kept
// in the journal but earns nothing anywhere.
//
// Two numbers come from before scores moved to the server, both fixed by the
// database when the migration ran, never taken from the app afterwards:
//   legacy_allowance  the most that phone-scored sightings (and the quests
//                     they complete) may add;
//   baseline_points   what the leaderboard showed then. So that nobody's
//                     score drops at the switch, whatever part of it the
//                     uploaded phone-scored sightings don't account for is
//                     carried over. It shrinks as they arrive (so nothing is
//                     counted twice) and never grows back (so deleting a
//                     sighting still lowers the score).
export async function computeTotals(jdb: JournalDb, uid: string, state: JournalState | null, now = Date.now()): Promise<Totals & { carryover: number }> {
  const rows = (await jdb.liveRows(uid)).filter((r) => r.points > 0);
  const zone = ianaZone(canonicalTimeZone(state?.tz) ?? 'UTC');
  const all = playerTotals(rows.map(toQuestSighting), { seed: uid, zone, now });
  const fromPhone = playerTotals(rows.filter((r) => !r.verified).map(toQuestSighting), { seed: uid, zone, now });
  const allowance = state?.legacy_allowance ?? 0;
  const overAllowance = Math.max(0, fromPhone.points - allowance);
  const carryover = state ? Math.min(state.carryover_points, Math.max(0, state.baseline_points - Math.min(fromPhone.points, allowance))) : 0;
  return { points: Math.max(0, all.points - overAllowance) + carryover, speciesCount: all.speciesCount, carryover };
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

// Remember the player's time zone (sent by the app with each request), under
// the name the server itself uses for it.
export async function noteTimeZone(jdb: JournalDb, uid: string, tz: unknown): Promise<void> {
  const zone = canonicalTimeZone(tz);
  if (!zone) return;
  const state = await jdb.getState(uid);
  if (state?.tz !== zone) await jdb.saveState(uid, { tz: zone });
}

// ---------- recording a sighting the server identified ----------
export type RecordOutcome =
  | { kind: 'recorded'; row: JournalRow; created: boolean }
  | { kind: 'refused'; reason: keyof typeof COPY_MESSAGES; message: string };

// `p` is what the identify endpoint saw, either straight from it or from a
// receipt it signed. Safe to call twice for the same sighting: the second
// call returns the row the first one wrote. Call it holding the account's
// lock (withJournalLock).
export async function recordSighting(jdb: JournalDb, p: ReceiptPayload, photoBase64?: string | null, opts: { places?: boolean } = {}): Promise<RecordOutcome> {
  // Already recorded (a retry), or already deleted by the player (the photo
  // was still being identified when they cancelled): nothing more to do.
  // A row that so far rests on the phone's word is different: the server has
  // now identified that photo itself, so its own result replaces the claim.
  const existing = await jdb.getRow(p.uid, p.sid);
  if (existing && (existing.deleted_at || existing.verified)) return { kind: 'recorded', row: existing, created: false };

  // A photo can only score if it can be compared with the ones already
  // known. Without a look-alike fingerprint (not a JPEG, or one that
  // couldn't be read) there is nothing to compare, so it isn't recorded.
  if (!p.phash || !p.mask || !HASH.test(p.phash) || !HASH.test(p.mask)) return refused(jdb, p, 'unchecked');

  // Is this picture already known? Flipped left to right counts as the same.
  const print: Print = { sha: p.sha, phash: p.phash, mask: p.mask };
  if (Object.values(LIBRARY_PRINTS).some((scouts) => samePhoto(print, scouts))) return refused(jdb, p, 'library');
  let duplicatePhoto = false;
  for (const m of await jdb.lookAlikes(p.uid, print)) {
    if (m.user_id !== p.uid) return refused(jdb, p, 'copied', m); // someone else logged (or posted) this picture first
    if (m.ref === p.sid) continue;
    // The player's own photo again: recorded, worth nothing. The very same
    // file always counts as that. A look-alike does only for an upload: with
    // the ClipIt camera, the frames of a burst, or a phone left watching one
    // spot, give pictures that look alike and are different photos; those
    // keep their normal (reduced) score as repeat sightings.
    if (m.exact || p.capture !== 'camera') duplicatePhoto = true;
  }

  // Earlier sightings of the species, deleted ones included (so deleting and
  // re-adding can't bring back the first-time bonus).
  const priorSameSpecies = await jdb.speciesCount(p.uid, p.id.sci, p.sid);
  let score = scoreSighting({
    rarityScore: p.id.rarity,
    // No behaviour multipliers for animals that could hurt someone: getting
    // close to a bear with cubs must never be worth more.
    sceneTags: p.id.dangerous ? [] : p.id.tags,
    firstOfSpecies: priorSameSpecies === 0,
    priorSameSpecies,
    duplicatePhoto,
  });
  // Field notes the player had already added to it keep their bonus.
  if (existing?.science) score = applyFieldNotesBonus(score, Object.keys(existing.science).length).score;

  const where = placeToStore(p.lat, p.lng, opts.places === true);
  const row: JournalRow = {
    user_id: p.uid,
    id: p.sid,
    observed_at: iso(p.observedAt),
    logged_at: iso(p.loggedAt),
    recorded_at: iso(Date.now()),
    deleted_at: null,
    lat: where.lat,
    lng: where.lng,
    status: existing?.proposed_species ? 'disputed' : p.id.status,
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
    flags: null,
    photo_sha: p.sha,
    photo_phash: p.phash,
    photo_mask: p.mask,
    has_photo: existing?.has_photo ?? false,
    science: existing?.science ?? null,
    proposed_species: existing?.proposed_species ?? null,
    wall_post_id: existing?.wall_post_id ?? null,
    model: p.model,
  };
  if (existing) {
    const { user_id: _u, id: _i, ...fields } = row;
    await jdb.updateRow(p.uid, p.sid, { ...fields, claimed_points: existing.claimed_points ?? null });
    if (row.wall_post_id) await jdb.setWallPostFacts(p.uid, row.wall_post_id, { points: row.points, common_name: row.common_name, scientific_name: row.scientific_name });
  } else if (!(await jdb.insertRow(row))) {
    const now = await jdb.getRow(p.uid, p.sid);
    if (now) return { kind: 'recorded', row: now, created: false };
    throw new JournalUnavailable('sighting could not be written');
  }
  await storePhoto(jdb, row, photoBase64);
  return { kind: 'recorded', row, created: true };
}

async function refused(jdb: JournalDb, p: ReceiptPayload, reason: keyof typeof COPY_MESSAGES, match?: Match): Promise<RecordOutcome> {
  await jdb.logRefusal({ user_id: p.uid, sighting_id: p.sid, reason, matched_user: match?.user_id ?? null, matched_ref: match ? `${match.source}:${match.ref}` : null }).catch(() => {});
  return { kind: 'refused', reason, message: COPY_MESSAGES[reason] };
}

// Keep a copy of the photo with the sighting: a JPEG of the size the app
// sends. For a sighting the server identified, only the picture it identified
// is accepted: the same bytes, or (when the app sends it later, resized
// again) one whose look-alike fingerprint says it is the same picture.
async function storePhoto(jdb: JournalDb, row: JournalRow, photoBase64: string | null | undefined, fingerprint?: (b64: string) => Print): Promise<void> {
  if (!photoBase64 || row.has_photo || row.deleted_at) return;
  const bytes = Buffer.from(photoBase64, 'base64');
  if (bytes.length < 100 || bytes.length > MAX_PHOTO_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  if (row.verified) {
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== row.photo_sha && !(fingerprint && samePhoto({ ...fingerprint(photoBase64), sha: null }, { phash: row.photo_phash, mask: row.photo_mask }))) return;
  }
  // (Kept without the details a camera or an editor may have written into the file.)
  if (await jdb.putPhoto(row.user_id, row.id, stripJpegMetadata(bytes))) {
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
  status?: unknown;
  common?: unknown;
  sci?: unknown;
  group?: unknown;
  confidence?: unknown;
  tags?: unknown;
  caption?: unknown;
  dangerous?: unknown;
  points?: unknown;
  capture?: unknown;
}

export type ImportOutcome = { kind: 'recorded'; row: JournalRow; created: boolean } | { kind: 'invalid'; error: string };

// These rest on what the app says. So: they are marked `verified: false`;
// they are worth their claimed points only during the legacy window, and in
// total no more than the account's allowance (see computeTotals); after the
// window they are kept for the journal's sake but worth nothing; no score
// breakdown is kept (a breakdown the app supplied must never be recomputed
// into points); and their photo is never used to turn down someone else's.
export async function importLegacy(jdb: JournalDb, uid: string, sid: string, claim: LegacyClaim, photoBase64?: string | null, now = Date.now(), opts: { places?: boolean } = {}): Promise<ImportOutcome> {
  const existing = await jdb.getRow(uid, sid);
  if (existing) return { kind: 'recorded', row: existing, created: false };

  // An old journal's names are tidied, never a reason to turn the sighting
  // away: older app versions stored the identifier's names as they came.
  const tidy = (v: unknown) => cleanName(v, 80) ?? tidyName(v, 80);
  const common = tidy(claim.common) ?? tidy(claim.sci) ?? 'Unidentified animal';
  const sci = tidy(claim.sci) ?? common;
  if (typeof claim.status !== 'string' || !STATUSES.includes(claim.status)) return { kind: 'invalid', error: 'not a sighting that counts' };

  // (With no end date set yet, the window is open.)
  const until = await jdb.legacyUntil();
  const state = await jdb.getState(uid);
  const open = (until == null || now < until) && (state?.legacy_allowance ?? 0) > 0;
  const claimed = typeof claim.points === 'number' && Number.isFinite(claim.points) ? clamp(Math.round(claim.points), 0, MAX_TOTAL_POINTS) : 0;

  const observedAt = saneTime(claim.observedAt, now, now, APP_START);
  const where = placeToStore(claim.lat, claim.lng, opts.places === true);
  const caption = typeof claim.caption === 'string' ? claim.caption.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  const row: JournalRow = {
    user_id: uid,
    id: sid,
    observed_at: iso(observedAt),
    logged_at: iso(saneTime(claim.loggedAt, observedAt, now, APP_START)),
    recorded_at: iso(now),
    deleted_at: null,
    lat: where.lat,
    lng: where.lng,
    status: claim.status as RowStatus,
    common_name: common,
    scientific_name: sci,
    taxon_group: (TAXON_GROUPS as readonly unknown[]).includes(claim.group) ? (claim.group as string) : null,
    confidence: typeof claim.confidence === 'number' && Number.isFinite(claim.confidence) ? clamp(claim.confidence, 0, 1) : null,
    scene_tags: Array.isArray(claim.tags) ? [...new Set(claim.tags.filter((t): t is string => (SCENE_TAG_CODES as readonly unknown[]).includes(t)))] : [],
    caption: caption && !hasBlockedLanguage(caption) ? caption : null,
    dangerous: claim.dangerous === true,
    points: open ? claimed : 0,
    claimed_points: claimed,
    score: null,
    verified: false,
    capture: claim.capture === 'camera' || claim.capture === 'library' ? claim.capture : null,
    flags: null,
    // The exact hash only: enough to spot the player handing in their own
    // file twice, and never used against anyone else.
    photo_sha: photoBase64 ? createHash('sha256').update(Buffer.from(photoBase64, 'base64')).digest('hex') : null,
    photo_phash: null,
    photo_mask: null,
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
  await storePhoto(jdb, row, photoBase64);
  return { kind: 'recorded', row, created: true };
}

// ---------- the player's own additions to a sighting ----------
export interface Edits {
  science?: unknown;
  proposedSpecies?: unknown;
  wallPostId?: unknown;
}

// Field-note answers, a suggested species, and which wall post shares the
// sighting. Answers earn a bonus point per real question, on sightings the
// server scored; a phone-scored sighting keeps its points whatever is sent.
// Returns the row as it now stands.
export async function applyEdits(jdb: JournalDb, row: JournalRow, edits: Edits): Promise<JournalRow> {
  if (row.deleted_at) return row;
  const patch: Partial<JournalRow> = {};
  if (edits.science !== undefined) {
    const science = cleanFieldNotes(edits.science);
    if (JSON.stringify(science) !== JSON.stringify(row.science ?? null)) {
      patch.science = science;
      if (row.verified && row.score) {
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
  const next = { ...row, ...patch };
  // The wall post that shares this sighting shows the journal's facts: set
  // them when the post is linked, and again whenever the points change.
  if (next.wall_post_id && (patch.wall_post_id !== undefined || patch.points !== undefined)) {
    await jdb.setWallPostFacts(next.user_id, next.wall_post_id, { points: next.points, common_name: next.common_name, scientific_name: next.scientific_name });
  }
  return next;
}

// ---------- deleting ----------
// The row stays as a marker (so the player's other devices drop the sighting
// instead of uploading it again), emptied of everything personal: no place,
// no notes, no points, and its dates become the time of deletion. Only what
// the marker is for is kept: the species (so delete-and-re-add can't reset
// it) and the photo's fingerprints (so the same photo can't score again).
//
// The stored photo is removed too. The marker goes on saying it has one until
// storage confirms it is gone, so a removal that fails is tried again (by the
// next request, or by the nightly job).
export async function deleteSightings(jdb: JournalDb, uid: string, sids: string[], now = Date.now(), opts: { markers?: boolean } = {}): Promise<string[]> {
  const gone: string[] = [];
  const withPhoto: string[] = [];
  let newMarkers = 0;
  let total: number | null = null;
  for (const sid of sids) {
    const row = await jdb.getRow(uid, sid);
    if (!row) {
      // The server has never seen this sighting. It may be on its way (the
      // player cancelled while the photo was still being identified): leave a
      // marker, so that when it arrives it is not recorded after all.
      if (opts.markers === false) {
        gone.push(sid);
        continue;
      }
      total ??= await jdb.countRows(uid);
      if (newMarkers < MAX_NEW_MARKERS && total + newMarkers < MAX_ROWS) {
        await jdb.insertRow(deletionMarker(uid, sid, now));
        newMarkers++;
      }
      gone.push(sid);
      continue;
    }
    if (!row.deleted_at) {
      await jdb.updateRow(uid, sid, {
        deleted_at: iso(now), observed_at: iso(now), logged_at: iso(now), recorded_at: iso(now),
        status: null, common_name: null, taxon_group: null, lat: null, lng: null, caption: null, points: 0, claimed_points: null, score: null,
        science: null, proposed_species: null, wall_post_id: null, flags: null, confidence: null, scene_tags: [], capture: null, model: null,
      });
    }
    if (row.has_photo) withPhoto.push(sid);
    gone.push(sid);
  }
  if (withPhoto.length && (await jdb.removePhotos(uid, withPhoto))) await jdb.clearPhotoFlags(uid, withPhoto);
  return gone;
}

function deletionMarker(uid: string, sid: string, now: number): JournalRow {
  return {
    user_id: uid, id: sid, observed_at: iso(now), logged_at: iso(now), recorded_at: iso(now), deleted_at: iso(now), lat: null, lng: null,
    status: null, common_name: null, scientific_name: null, taxon_group: null, confidence: null, scene_tags: [], caption: null, dangerous: false, points: 0,
    score: null, verified: false, capture: null, flags: null, photo_sha: null, photo_phash: null, photo_mask: null, has_photo: false, science: null, proposed_species: null,
    wall_post_id: null, model: null,
  };
}

// ---------- erasing ----------
// Remove everything saved to the account's journal: every row (markers too),
// the notes about refused photos, the stored photos and the time zone. Used
// when the player turns the backup off and asks for what was saved to be
// deleted, and when an account turns out to belong to someone under 13.
// Afterwards the account's answer stands at "no": nothing more is stored.
export async function eraseJournal(jdb: JournalDb, uid: string, now = Date.now()): Promise<void> {
  await jdb.purgePhotos(uid);
  await jdb.deleteJournal(uid);
  await jdb.saveState(uid, { tz: null, backup: 'no', save_places: false, erased_at: iso(now) });
}

// ---------- the switch to server-kept scores ----------
// An account switches the first time an updated app syncs: from then on the
// server writes its leaderboard score and the app's own number is ignored.
// Nothing is read from the app or from the leaderboard at this point. What
// the account brings with it (its baseline and its allowance for phone-scored
// sightings) was fixed by the database when the migration ran; an account
// created since then brings nothing.
export async function ensureReady(jdb: JournalDb, uid: string, now = Date.now()): Promise<void> {
  const state = await jdb.getState(uid);
  if (!state?.ready_at) await jdb.saveState(uid, { ready_at: iso(now) });
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
  /** The account is being deleted: remove its stored photos now. */
  purge?: unknown;
  /** The player's choices, when they change: { backup: 'yes' | 'no', places: boolean }. */
  prefs?: unknown;
  /** Remove everything saved to the account's journal (see eraseJournal). */
  erase?: unknown;
}
export type SyncRow = PublicRow | { error: string } | { refused: string };

export interface SyncResult {
  rows: Record<string, SyncRow>;
  deleted: string[];
  totals: Totals | null;
  ready: boolean;
  legacyOpen: boolean;
  /** The account's choices as they now stand (every device follows these). */
  prefs: Prefs;
}

function readPrefs(v: unknown): { backup?: 'yes' | 'no'; places?: boolean } {
  if (!v || typeof v !== 'object') return {};
  const p = v as { backup?: unknown; places?: unknown };
  return {
    ...(p.backup === 'yes' || p.backup === 'no' ? { backup: p.backup } : {}),
    ...(typeof p.places === 'boolean' ? { places: p.places } : {}),
  };
}

export const prefsOf = (state: JournalState | null): Prefs => ({
  backup: state?.backup ?? null,
  places: state?.save_places === true,
  placesSet: typeof state?.save_places === 'boolean',
  epoch: state?.erased_at ?? null,
});

export const MAX_SYNC_ITEMS = 40;
export const MAX_SYNC_DELETES = 100;
export const MAX_SYNC_PHOTOS = 6;

// Call it holding the account's lock (withJournalLock). `fingerprint` reads a
// photo's look-alike hash (passed in so this file needs no image decoder).
export async function syncJournal(
  jdb: JournalDb,
  uid: string,
  body: SyncBody,
  opts: { now?: number; fingerprint?: (b64: string) => Print; onBadReceipt?: (sid: string) => void; budgetMs?: number } = {},
): Promise<SyncResult> {
  const now = opts.now ?? Date.now();
  // Stop taking items when time is nearly up (the account's lock frees itself
  // after 15 seconds); what wasn't reached is simply sent again next time.
  const stopAt = Date.now() + (opts.budgetMs ?? 12_000);
  const legacyOpen = async () => {
    const until = await jdb.legacyUntil();
    return until == null || now < until;
  };
  if (body.purge === true) {
    await jdb.purgePhotos(uid);
    return { rows: {}, deleted: [], totals: null, ready: false, legacyOpen: false, prefs: prefsOf(null) };
  }
  if (body.erase === true) {
    await eraseJournal(jdb, uid, now);
    const totals = await refreshTotals(jdb, uid, now);
    return { rows: {}, deleted: [], totals, ready: totals !== null, legacyOpen: await legacyOpen(), prefs: prefsOf(await jdb.getState(uid)) };
  }

  // The player's choices belong to the account: they are recorded here and
  // every device follows them. Switching places off also forgets the places
  // already saved.
  let state = await jdb.getState(uid);
  const asked = readPrefs(body.prefs);
  const change: Partial<Pick<JournalState, 'backup' | 'save_places'>> = {};
  if (asked.backup && asked.backup !== (state?.backup ?? null)) change.backup = asked.backup;
  if (asked.places !== undefined && asked.places !== (state?.save_places ?? null)) change.save_places = asked.places;
  if (Object.keys(change).length) {
    await jdb.saveState(uid, change);
    if (change.save_places === false && state?.save_places === true) await jdb.clearPlaces(uid);
    state = await jdb.getState(uid);
  }
  const prefs = prefsOf(state);

  // Something the player deleted is always removed, whatever the choice.
  // (Markers for sightings the server has never seen are only left for an
  // account whose journal is being saved: otherwise nothing is on its way.)
  const deletes = Array.isArray(body.deletes) ? body.deletes.filter(validSightingId).slice(0, MAX_SYNC_DELETES) : [];
  const deleted = deletes.length ? await deleteSightings(jdb, uid, deletes, now, { markers: prefs.backup === 'yes' }) : [];

  // Nothing is stored for an account that hasn't said yes.
  if (prefs.backup !== 'yes') {
    const totals = deleted.length ? await refreshTotals(jdb, uid, now) : null;
    return { rows: {}, deleted, totals, ready: Boolean(state?.ready_at), legacyOpen: await legacyOpen(), prefs };
  }

  await noteTimeZone(jdb, uid, body.tz);
  await ensureReady(jdb, uid, now);

  const rows: Record<string, SyncRow> = {};
  const items = Array.isArray(body.items) ? (body.items as SyncItem[]).slice(0, MAX_SYNC_ITEMS) : [];
  let total: number | null = null;
  let photos = 0;
  for (const item of items) {
    if (Date.now() > stopAt) break;
    if (!item || !validSightingId(item.id)) continue;
    const sid = item.id;
    const photo = typeof item.photoBase64 === 'string' && item.photoBase64.length < 1_000_000 && photos++ < MAX_SYNC_PHOTOS ? item.photoBase64 : null;
    let row = await jdb.getRow(uid, sid);
    if (!row) {
      const receipt = verifyReceipt(item.receipt, uid, sid, now);
      if (item.receipt && !receipt) opts.onBadReceipt?.(sid);
      if (receipt) {
        const out = await recordSighting(jdb, receipt, photo, { places: prefs.places });
        if (out.kind === 'refused') {
          rows[sid] = { refused: out.message };
          continue;
        }
        row = out.row;
      } else if (item.legacy && typeof item.legacy === 'object') {
        total ??= await jdb.countRows(uid);
        if (total >= MAX_ROWS) {
          rows[sid] = { error: 'journal is full' };
          continue;
        }
        const out = await importLegacy(jdb, uid, sid, item.legacy, photo, now, { places: prefs.places });
        if (out.kind === 'invalid') {
          rows[sid] = { error: out.error };
          continue;
        }
        row = out.row;
        if (out.created) total++;
      } else {
        rows[sid] = { error: 'nothing to record' };
        continue;
      }
    } else if (photo && !row.has_photo && !row.deleted_at) {
      // The row exists but its photo never arrived (the upload failed last time).
      await storePhoto(jdb, row, photo, opts.fingerprint);
    }
    rows[sid] = publicRow(await applyEdits(jdb, row, item));
  }

  const totals = await refreshTotals(jdb, uid, now);
  return { rows, deleted, totals, ready: totals !== null, legacyOpen: await legacyOpen(), prefs };
}
