// The rules of the cloud journal (api/_lib/journal.ts), run against an
// in-memory stand-in for the database. Many of these are attacks a reviewer
// found against an earlier version: each is named for what must not work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import {
  applyEdits, COPY_MESSAGES, deleteSightings, ensureReady, importLegacy, JournalBusy, MAX_SYNC_PHOTOS, publicRow, recordSighting, refreshTotals, syncJournal,
  withJournalLock, type JournalDb, type JournalRow, type JournalState, type Match, type Refusal,
} from '../api/_lib/journal';
import { asTheServerCounts, fromCloudRow, type CloudRow } from '../src/lib/journalMerge';
import { signReceipt, type ReceiptPayload } from '../api/_lib/receipt';
import { LIBRARY_PRINTS } from '../api/_lib/libraryHashes';
import { compare, mirrorPrint, photoFingerprint, samePhoto } from '../api/_lib/phash';
import { playerTotals } from '../shared/quests';
import { ianaZone } from '../shared/zone';

process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const NOW = Date.parse('2026-11-12T15:00:00Z');
const DAY = 86_400_000;

// `choice`: what the accounts have answered to "save my journal to my account"
// (most tests are about accounts that said yes, places included).
function fakeDb(legacyUntil: number | null = NOW + 30 * DAY, choice: { backup?: 'yes' | 'no' | null; places?: boolean | null } = {}) {
  const rows = new Map<string, JournalRow>();
  const states = new Map<string, JournalState>();
  const profiles = new Map<string, { points: number; species_count: number }>();
  const photos = new Map<string, Buffer>();
  const wall: { post_id: string; user_id: string; photo_sha: string | null; photo_phash: string | null; photo_mask: string | null }[] = [];
  const refusals: Refusal[] = [];
  const wallFacts = new Map<string, { points: number; common_name: string | null; scientific_name: string | null }>();
  const locks = new Set<string>();
  const key = (uid: string, sid: string) => `${uid}/${sid}`;
  const state = (uid: string): JournalState =>
    states.get(uid) ?? {
      user_id: uid, tz: null, ready_at: null, baseline_points: 0, carryover_points: 0, legacy_allowance: 0,
      backup: choice.backup === undefined ? 'yes' : choice.backup, save_places: choice.places === undefined ? true : choice.places, erased_at: null,
    };
  const storage = { failing: false }; // set to make photo removal fail, as storage sometimes does
  const tick = () => new Promise((r) => setTimeout(r, 0)); // every call yields, as a real database call does
  const jdb: JournalDb = {
    async getRow(uid, sid) { await tick(); return rows.get(key(uid, sid)) ?? null; },
    async liveRows(uid) { await tick(); return [...rows.values()].filter((r) => r.user_id === uid && !r.deleted_at); },
    async countRows(uid) { await tick(); return [...rows.values()].filter((r) => r.user_id === uid).length; },
    // (Earlier sightings that count: every one the server identified, deleted or not, and phone-scored ones worth something.)
    async speciesCount(uid, sci, except) { await tick(); return [...rows.values()].filter((r) => r.user_id === uid && r.scientific_name === sci && r.id !== except && (r.verified || r.points > 0)).length; },
    // The same rule as public.journal_look_alikes: sightings the server identified (anyone's), wall photos (anyone's), and the asker's own.
    async lookAlikes(uid, print) {
      await tick();
      const prints = [
        ...[...rows.values()].filter((r) => (r.verified || r.user_id === uid) && (r.photo_sha || r.photo_phash)).map((r) => ({ source: 'journal' as const, user_id: r.user_id, ref: r.id, sha: r.photo_sha, phash: r.photo_phash, mask: r.photo_mask })),
        ...wall.map((w) => ({ source: 'wall' as const, user_id: w.user_id, ref: w.post_id, sha: w.photo_sha, phash: w.photo_phash, mask: w.photo_mask })),
      ];
      return prints
        .map((p) => ({ match: { source: p.source, user_id: p.user_id, ref: p.ref, exact: Boolean(print.sha && p.sha === print.sha) } as Match, alike: samePhoto({ phash: print.phash, mask: print.mask }, { phash: p.phash, mask: p.mask }) }))
        .filter((x) => x.match.exact || x.alike)
        .map((x) => x.match);
    },
    async insertRow(row) {
      await tick();
      if (rows.has(key(row.user_id, row.id))) return false;
      rows.set(key(row.user_id, row.id), { ...row });
      return true;
    },
    async updateRow(uid, sid, patch) { await tick(); rows.set(key(uid, sid), { ...rows.get(key(uid, sid))!, ...patch }); },
    // (A row always exists by the time anything asks: taking the lock creates it.)
    async getState(uid) { await tick(); return state(uid); },
    async saveState(uid, patch) { await tick(); states.set(uid, { ...state(uid), ...patch }); },
    async setProfileTotals(uid, points, species_count) { await tick(); profiles.set(uid, { points, species_count }); },
    async setWallPostFacts(_uid, postId, facts) { wallFacts.set(postId, facts); },
    async legacyUntil() { return legacyUntil; },
    async putPhoto(uid, sid, bytes) { photos.set(key(uid, sid), bytes); return true; },
    async removePhotos(uid, sids) { if (storage.failing) return false; for (const s of sids) photos.delete(key(uid, s)); return true; },
    async clearPhotoFlags(uid, sids) { for (const s of sids) rows.set(key(uid, s), { ...rows.get(key(uid, s))!, has_photo: false }); },
    async clearPlaces(uid) { for (const [k, r] of rows) if (r.user_id === uid) rows.set(k, { ...r, lat: null, lng: null }); },
    async deleteJournal(uid) {
      for (const [k, r] of rows) if (r.user_id === uid) rows.delete(k);
      for (let i = refusals.length - 1; i >= 0; i--) if (refusals[i].user_id === uid) refusals.splice(i, 1);
    },
    async purgePhotos(uid) { for (const k of [...photos.keys()]) if (k.startsWith(`${uid}/`)) photos.delete(k); },
    async logRefusal(entry) { refusals.push(entry); },
    async tryLock(uid) { await tick(); if (locks.has(uid)) return false; locks.add(uid); return true; },
    async unlock(uid) { locks.delete(uid); },
  };
  // An account that existed when the migration ran: the database gave it a baseline and an allowance.
  const existing = (uid: string, baseline: number, allowance: number) => states.set(uid, { ...state(uid), baseline_points: baseline, carryover_points: baseline, legacy_allowance: allowance });
  return { jdb, rows, states, profiles, photos, wall, refusals, wallFacts, existing, storage, state, row: (uid: string, sid: string) => rows.get(key(uid, sid))! };
}

// Fingerprints with a real pattern, far apart from each other, and copies a few bits away.
// (Every comparison in them counts as clear-cut, so all 256 bits are compared.)
const CLEAR = 'f'.repeat(64);
let n = 0;
const fresh = () => createHash('sha256').update(`pattern-${++n}`).digest('hex');
const flip = (h: string, bits: number) => h.split('').map((c, i) => (i < bits ? (parseInt(c, 16) ^ 1).toString(16) : c)).join('');
const sighting = (over: Omit<Partial<ReceiptPayload>, 'id'> & { id?: Partial<ReceiptPayload['id']> } = {}): ReceiptPayload => {
  const { id, ...rest } = over;
  const phash = fresh();
  return {
    v: 1, uid: A, sid: `sight-${n}-abc`, at: NOW, observedAt: NOW - 3600_000, loggedAt: NOW - 3000_000, lat: 44.1234, lng: -72.5678,
    capture: 'camera', cameraEvidence: null,
    id: { status: 'ai_confident', common: 'Osprey', sci: 'Pandion haliaetus', group: 'bird', confidence: 0.93, rarity: 0.4, tags: [], dangerous: false, caption: 'An osprey.', ...id },
    sha: createHash('sha256').update(`bytes-${n}`).digest('hex'), phash, mask: CLEAR, model: 'test', ...rest,
  };
};
const claim = (over: Record<string, unknown> = {}) => ({
  observedAt: NOW - 20 * DAY, loggedAt: NOW - 20 * DAY, lat: 44, lng: -72, status: 'ai_confident', common: 'Red fox', sci: 'Vulpes vulpes', group: 'mammal',
  confidence: 0.9, tags: ['in_flight', 'made_up_tag'], caption: 'A fox at dusk.', points: 12, ...over,
});
const madeUp = (i: number) => `Fakeus number${String.fromCharCode(97 + (i % 26))}${i > 25 ? 'b' : ''}`;

// ---------- recording and scoring ----------
test('a recorded sighting is scored by the server, and recording it twice changes nothing', async () => {
  const { jdb, row } = fakeDb();
  const p = sighting({ id: { rarity: 0.5, tags: ['in_flight'] } });
  const first = await recordSighting(jdb, p, null, { places: true });
  assert.equal(first.kind, 'recorded');
  const r = row(A, p.sid);
  assert.equal(r.verified, true);
  assert.equal(r.score!.basePoints, 6); // 1 + 20 × 0.5²
  assert.equal(r.score!.behaviorMultiplier, 1.5);
  assert.equal(r.score!.bonuses.firstOfSpecies, 5);
  assert.equal(r.points, 14); // round(6 × 1.5) + 5
  // the place is kept to two decimals (about a kilometre), never the exact spot
  assert.deepEqual([r.lat, r.lng, r.status, r.scientific_name], [44.12, -72.57, 'ai_confident', 'Pandion haliaetus']);
  // and not at all unless the player saves places
  const unplaced = sighting();
  await recordSighting(jdb, unplaced);
  assert.deepEqual([row(A, unplaced.sid).lat, row(A, unplaced.sid).lng], [null, null]);
  const again = await recordSighting(jdb, { ...p, id: { ...p.id, rarity: 1 } }); // a retry, or a tampered resend
  assert.equal(again.kind === 'recorded' && again.created, false);
  assert.equal(row(A, p.sid).points, 14);
});

test('a species seen before is worth less each time; a dangerous animal gets no behaviour bonus', async () => {
  const { jdb, row } = fakeDb();
  const shots = [sighting({ id: { rarity: 0.5 } }), sighting({ id: { rarity: 0.5 } }), sighting({ id: { rarity: 0.5 } })];
  for (const p of shots) await recordSighting(jdb, p);
  assert.deepEqual(shots.map((p) => row(A, p.sid).points), [11, 3, 2]); // 6+5, 6/2, 6/3
  const bear = sighting({ id: { sci: 'Ursus arctos', common: 'Brown bear', rarity: 0.5, tags: ['with_young'], dangerous: true } });
  await recordSighting(jdb, bear);
  assert.equal(row(A, bear.sid).score!.behaviorMultiplier, 1);
  assert.deepEqual(row(A, bear.sid).scene_tags, ['with_young']); // still recorded as seen
});

// ---------- copies ----------
test('a photo another player already logged is refused: the same file, a re-saved copy, a mirrored copy', async () => {
  const { jdb, rows, refusals } = fakeDb();
  const original = sighting({ uid: A });
  await recordSighting(jdb, original);
  const exact = await recordSighting(jdb, sighting({ uid: B, sha: original.sha }));
  assert.deepEqual(exact, { kind: 'refused', reason: 'copied', message: COPY_MESSAGES.copied });
  assert.equal((await recordSighting(jdb, sighting({ uid: B, phash: flip(original.phash!, 15) }))).kind, 'refused');
  assert.equal((await recordSighting(jdb, sighting({ uid: B, phash: flip(mirrorPrint(original)!.phash, 6) }))).kind, 'refused');
  // 30 of the 256 clear-cut bits different is a different picture
  assert.equal(compare(original, { phash: flip(original.phash!, 30), mask: CLEAR })!.differing, 30);
  assert.equal((await recordSighting(jdb, sighting({ uid: B }))).kind, 'recorded'); // a different photo
  assert.equal([...rows.values()].filter((r) => r.user_id === B).length, 1);
  // each refusal is on record, with what it matched, so a wrong call can be put right
  assert.equal(refusals.length, 3);
  assert.deepEqual([refusals[0].user_id, refusals[0].reason, refusals[0].matched_user, refusals[0].matched_ref], [B, 'copied', A, `journal:${original.sid}`]);
});

test('one of Scout\'s own library photos is refused, mirrored or not', async () => {
  const { jdb } = fakeDb();
  const libraryPhoto = Object.values(LIBRARY_PRINTS)[7];
  assert.deepEqual(await recordSighting(jdb, sighting({ phash: flip(libraryPhoto.phash, 10), mask: libraryPhoto.mask })), { kind: 'refused', reason: 'library', message: COPY_MESSAGES.library });
  assert.equal((await recordSighting(jdb, sighting(mirrorPrint(libraryPhoto)!))).kind, 'refused');
});

test('a photo taken from the wall is refused; the poster\'s own later sighting is not blocked by it', async () => {
  const { jdb, wall } = fakeDb();
  const posted = fresh();
  wall.push({ post_id: '20000000-0000-4000-8000-0000000000a1', user_id: A, photo_sha: 'wall-sha', photo_phash: posted, photo_mask: CLEAR });
  const stolen = await recordSighting(jdb, sighting({ uid: B, phash: flip(posted, 9) }));
  assert.equal(stolen.kind, 'refused');
  const own = await recordSighting(jdb, sighting({ uid: A, phash: flip(posted, 9) })); // A photographing the same scene again
  assert.equal(own.kind, 'recorded');
  // The poster's own sighting of that photo is not a "duplicate" of their wall post: the post is a share of the
  // sighting, not a second one. (An uploaded photo that was shared to the wall, identified by the server later.)
  const second = fakeDb();
  const sharedPhoto = fresh();
  second.wall.push({ post_id: '20000000-0000-4000-8000-0000000000a2', user_id: A, photo_sha: 'wall-sha-2', photo_phash: sharedPhoto, photo_mask: CLEAR });
  const shared = sighting({ uid: A, phash: flip(sharedPhoto, 3), capture: 'library', cameraEvidence: true, id: { sci: 'Lynx rufus', common: 'Bobcat' } });
  const recorded = await recordSighting(second.jdb, shared);
  assert.ok(recorded.kind === 'recorded' && recorded.row.points > 0, JSON.stringify(recorded.kind === 'recorded' ? recorded.row.score : recorded));
  // …while someone else handing in that wall photo is still refused
  assert.equal((await recordSighting(second.jdb, sighting({ uid: B, phash: flip(sharedPhoto, 3), capture: 'library', cameraEvidence: true }))).kind, 'refused');
});

test('a photo that cannot be fingerprinted (not a JPEG) is not recorded at all', async () => {
  const { jdb, rows } = fakeDb();
  const out = await recordSighting(jdb, sighting({ phash: null }));
  assert.deepEqual(out, { kind: 'refused', reason: 'unchecked', message: COPY_MESSAGES.unchecked });
  assert.equal((await recordSighting(jdb, sighting({ phash: 'not-a-hash' }))).kind, 'refused');
  assert.equal((await recordSighting(jdb, sighting({ mask: null }))).kind, 'refused'); // half a fingerprint is none
  assert.equal(rows.size, 0);
});

test('a sighting only someone\'s phone vouches for cannot be used to block another player\'s photo', async () => {
  const { jdb, existing, row } = fakeDb();
  existing(B, 0, 500);
  // B "pre-registers" A's photo as an old sighting (no identification is run), then deletes it.
  const p = sighting({ uid: A });
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 3)]);
  p.sha = createHash('sha256').update(jpg).digest('hex');
  await importLegacy(jdb, B, 'grief-000001', claim(), jpg.toString('base64'), NOW);
  assert.equal(row(B, 'grief-000001').photo_phash, null); // phone-scored uploads carry no look-alike fingerprint
  await deleteSightings(jdb, B, ['grief-000001'], NOW);
  const out = await recordSighting(jdb, p);
  assert.equal(out.kind, 'recorded');
  assert.ok(row(A, p.sid).points > 0);
});

test('the player\'s own photo again scores nothing; frames of a burst with the ClipIt camera score as repeats', async () => {
  const { jdb, row } = fakeDb();
  const first = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, first);
  // the very same file again (a retry under a new id, a re-submission): nothing, however it was captured
  const sameFile = sighting({ id: { rarity: 0.5 }, sha: first.sha, phash: first.phash });
  await recordSighting(jdb, sameFile);
  assert.deepEqual([row(A, sameFile.sid).points, row(A, sameFile.sid).score!.repeatMultiplier], [0, 0]);
  // the same picture uploaded again from the camera roll, re-saved (new bytes, same look): nothing
  const reupload = sighting({ id: { rarity: 0.5 }, phash: flip(first.phash!, 2), capture: 'library', cameraEvidence: true });
  await recordSighting(jdb, reupload);
  assert.deepEqual([row(A, reupload.sid).points, row(A, reupload.sid).score!.repeatMultiplier], [0, 0]);
  // the next frame of a burst with the ClipIt camera looks the same and is a different photo: a repeat of the species
  const burst = sighting({ id: { rarity: 0.5 }, phash: flip(first.phash!, 2), capture: 'camera' });
  await recordSighting(jdb, burst);
  assert.equal(row(A, burst.sid).points, 2); // fourth of the species (the two above count as sightings of it): 6 / 4 = 1.5, rounded
  // a different upload of the same animal (a different picture) also scores as a repeat
  const other = sighting({ id: { rarity: 0.5 }, capture: 'library', cameraEvidence: true });
  await recordSighting(jdb, other);
  assert.ok(row(A, other.sid).points > 0);
});

test('twenty requests for the same photo at once score it once (one request at a time per account)', async () => {
  const { jdb, rows } = fakeDb();
  const base = sighting({ id: { rarity: 0.9 } });
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => withJournalLock(jdb, A, 5000, () => recordSighting(jdb, { ...base, sid: `burst-${String(i).padStart(4, '0')}` }))),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 20);
  const points = [...rows.values()].map((r) => r.points).sort((a, b) => b - a);
  assert.equal(points.filter((p) => p > 0).length, 1, `points: ${points.join(',')}`);
  assert.equal([...rows.values()].filter((r) => r.score!.bonuses.firstOfSpecies > 0).length, 1);
  // without waiting, a second request simply doesn't get in (and the identify endpoint hands back a receipt instead)
  const held = withJournalLock(jdb, A, 0, () => new Promise((r) => setTimeout(r, 30)));
  await new Promise((r) => setTimeout(r, 5));
  await assert.rejects(withJournalLock(jdb, A, 0, async () => 1), JournalBusy);
  await held;
  assert.equal(await withJournalLock(jdb, A, 0, async () => 1), 1); // released afterwards
});

// ---------- deleting ----------
test('deleting empties the sighting but its species and fingerprints still count against re-adding', async () => {
  const { jdb, row, photos } = fakeDb();
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 9)]);
  const first = sighting({ id: { rarity: 0.5 }, sha: createHash('sha256').update(jpg).digest('hex') });
  await recordSighting(jdb, first, jpg.toString('base64'), { places: true });
  assert.equal(photos.size, 1);
  assert.deepEqual(await deleteSightings(jdb, A, [first.sid], NOW), [first.sid]);
  const gone = row(A, first.sid);
  assert.ok(gone.deleted_at);
  assert.deepEqual([gone.lat, gone.lng, gone.caption, gone.common_name, gone.points, gone.status], [null, null, null, null, 0, null]);
  // the marker keeps only what it is for: the species and the fingerprints. Not when or how the photo was taken.
  assert.equal(gone.scientific_name, 'Pandion haliaetus');
  assert.equal(gone.photo_phash, first.phash);
  const at = new Date(NOW).toISOString();
  assert.deepEqual([gone.observed_at, gone.logged_at, gone.recorded_at, gone.taxon_group, gone.capture, gone.model], [at, at, at, null, null, null]);
  assert.equal(photos.size, 0);
  assert.equal(gone.has_photo, false);
  // the same species again: no first-time bonus
  const again = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, again);
  assert.equal(row(A, again.sid).score!.bonuses.firstOfSpecies, 0);
  // the very same photo again: nothing; and another account can't have it either
  const samePhoto = sighting({ sha: first.sha, phash: first.phash });
  await recordSighting(jdb, samePhoto);
  assert.equal(row(A, samePhoto.sid).points, 0);
  assert.equal((await recordSighting(jdb, sighting({ uid: B, sha: first.sha, phash: first.phash }))).kind, 'refused');
  // a deleted sighting stays deleted if the app sends it again
  const resent = await recordSighting(jdb, first);
  assert.ok(resent.kind === 'recorded' && resent.row.deleted_at);
});

test('a sighting cancelled while it was still being identified is not recorded when the answer arrives', async () => {
  const { jdb, row, rows } = fakeDb();
  const p = sighting();
  assert.deepEqual(await deleteSightings(jdb, A, [p.sid], NOW), [p.sid]); // the server hasn't seen it yet
  const out = await recordSighting(jdb, p);
  assert.ok(out.kind === 'recorded' && out.created === false && out.row.deleted_at);
  assert.equal(row(A, p.sid).points, 0);
  assert.equal(rows.size, 1);
  // only so many markers per request (they are rows too)
  const many = Array.from({ length: 60 }, (_, i) => `never-seen-${String(i).padStart(3, '0')}`);
  assert.equal((await deleteSightings(jdb, A, many, NOW)).length, 60); // all acknowledged…
  assert.equal(rows.size, 21); // …twenty markers written
});

// ---------- the stored photo ----------
test('the stored photo must be a JPEG of the app\'s size, and the picture that was identified', async () => {
  const { jdb, photos, row } = fakeDb();
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 9)]);
  const p = sighting({ sha: createHash('sha256').update(jpg).digest('hex') });
  await recordSighting(jdb, p, Buffer.concat([jpg, Buffer.from([1])]).toString('base64')); // some other picture
  assert.equal(photos.size, 0);
  assert.equal(row(A, p.sid).has_photo, false);
  const other = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 8)]);
  const q = sighting({ sha: createHash('sha256').update(other).digest('hex'), id: { sci: 'Ardea herodias', common: 'Great blue heron' } });
  await recordSighting(jdb, q, other.toString('base64'));
  assert.equal(row(A, q.sid).has_photo, true);
  // too big, or not a JPEG: not stored
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(800_000, 9)]);
  const r = sighting({ sha: createHash('sha256').update(big).digest('hex'), id: { sci: 'Buteo jamaicensis', common: 'Red-tailed hawk' } });
  await recordSighting(jdb, r, big.toString('base64'));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(400, 9)]);
  const s = sighting({ sha: createHash('sha256').update(png).digest('hex'), id: { sci: 'Strix varia', common: 'Barred owl' } });
  await recordSighting(jdb, s, png.toString('base64'));
  assert.deepEqual([row(A, r.sid).has_photo, row(A, s.sid).has_photo, photos.size], [false, false, 1]);
});

test('a photo sent later for a recorded sighting is accepted when it is the same picture, re-saved', async () => {
  const { jdb, photos, row } = fakeDb();
  const original = readFileSync(join(__dirname, '..', 'site', 'img', 'library', 'osprey.jpg'));
  const print = photoFingerprint(original.toString('base64'));
  // (a library photo stands in for a player's photo here, so the row is put in place directly, past the "one of Scout's photos" rule)
  const p = sighting({ sha: print.sha, phash: print.phash, mask: print.mask });
  const scratch = fakeDb();
  await recordSighting(scratch.jdb, { ...p, phash: fresh(), mask: CLEAR });
  await jdb.insertRow({ ...scratch.row(A, p.sid), photo_sha: p.sha, photo_phash: p.phash, photo_mask: p.mask });
  const resaved = jpeg.encode(jpeg.decode(original, { useTArray: true }) as any, 60).data.toString('base64');
  const other = readFileSync(join(__dirname, '..', 'site', 'img', 'library', 'bison.jpg')).toString('base64');
  await syncJournal(jdb, A, { items: [{ id: p.sid, photoBase64: other }] }, { now: NOW, fingerprint: photoFingerprint });
  assert.equal(row(A, p.sid).has_photo, false); // a different picture is not stored against it
  await syncJournal(jdb, A, { items: [{ id: p.sid, photoBase64: resaved }] }, { now: NOW, fingerprint: photoFingerprint });
  assert.equal(row(A, p.sid).has_photo, true);
  assert.equal(photos.size, 1);
});

// ---------- sightings scored on the phone, before scores moved to the server ----------
test('an existing account\'s old journal is accepted once, during the legacy window, marked as not verified', async () => {
  const { jdb, row, existing } = fakeDb();
  existing(A, 0, 5000);
  const out = await importLegacy(jdb, A, 'legacy-aaa1', claim(), null, NOW);
  assert.equal(out.kind, 'recorded');
  const r = row(A, 'legacy-aaa1');
  assert.deepEqual([r.verified, r.points, r.claimed_points, r.scientific_name, r.taxon_group, r.score], [false, 12, 12, 'Vulpes vulpes', 'mammal', null]);
  assert.deepEqual(r.scene_tags, ['in_flight']); // unknown tags dropped
  await importLegacy(jdb, A, 'legacy-aaa1', claim({ points: 400 }), null, NOW); // sent again
  assert.equal(row(A, 'legacy-aaa1').points, 12);
});

test('what the phone claims is bounded per sighting, and by what a name may be', async () => {
  const { jdb, row, existing } = fakeDb();
  existing(A, 0, 5000);
  await importLegacy(jdb, A, 'legacy-big1', claim({ points: 999_999 }), null, NOW);
  assert.equal(row(A, 'legacy-big1').points, 500);
  assert.equal((await importLegacy(jdb, A, 'legacy-bad3', claim({ status: 'ineligible' }), null, NOW)).kind, 'invalid');
  // An old journal's names are tidied, never a reason to lose the sighting
  // (older app versions stored the identifier's names as they came).
  for (const [i, [given, sci, common]] of ([
    [{ sci: 'Buteo jamaicensis?', common: 'Red-tailed hawk' }, 'Buteo jamaicensis', 'Red-tailed hawk'],
    [{ sci: 'Passer domesticus, female', common: 'House sparrow (female)' }, 'Passer domesticus female', 'House sparrow (female)'],
    [{ sci: 'Corvus brachyrhynchos/ossifragus', common: 'Crow' }, 'Corvus brachyrhynchos ossifragus', 'Crow'],
    [{ sci: '<script>alert(1)</script>', common: 'Fuck' }, 'script alert script', 'script alert script'],
    [{ sci: '12345', common: '!!!' }, 'Unidentified animal', 'Unidentified animal'],
    [{ sci: 'Fuck', common: 'shit' }, 'Unidentified animal', 'Unidentified animal'],
  ] as const).entries()) {
    const out = await importLegacy(jdb, A, `legacy-name${i}`, claim(given), null, NOW);
    assert.equal(out.kind, 'recorded', JSON.stringify(given));
    assert.deepEqual([row(A, `legacy-name${i}`).scientific_name, row(A, `legacy-name${i}`).common_name], [sci, common]);
  }
  await importLegacy(jdb, A, 'legacy-cap1', claim({ caption: 'what the fuck' }), null, NOW);
  assert.equal(row(A, 'legacy-cap1').caption, null);
  // a photo's own date is kept, however old (it is what the journal shows)…
  await importLegacy(jdb, A, 'legacy-old1', claim({ observedAt: Date.UTC(2015, 0, 5) }), null, NOW);
  assert.equal(Date.parse(row(A, 'legacy-old1').observed_at), Date.UTC(2015, 0, 5));
  // …and the base (rarity) points the phone reported are kept for the one quest that looks at them, bounded
  await importLegacy(jdb, A, 'legacy-base1', claim({ score: { basePoints: 17.4, totalPoints: 99999 } }), null, NOW);
  await importLegacy(jdb, A, 'legacy-base2', claim({ score: { basePoints: 5000 } }), null, NOW);
  await importLegacy(jdb, A, 'legacy-base3', claim({ score: 'nonsense' }), null, NOW);
  assert.deepEqual([row(A, 'legacy-base1').claimed_base, row(A, 'legacy-base2').claimed_base, row(A, 'legacy-base3').claimed_base], [17, 30, null]);
  assert.equal(row(A, 'legacy-base1').score, null); // never a breakdown, never points
  assert.equal(row(A, 'legacy-base1').points, 12);
});

test('until an end date is set the legacy window is open (the clock starts with the server\'s first nightly job, not with the migration)', async () => {
  const { jdb, row, existing } = fakeDb(null);
  existing(A, 0, 5000);
  await importLegacy(jdb, A, 'legacy-nodate', claim(), null, NOW);
  assert.equal(row(A, 'legacy-nodate').points, 12);
  assert.equal((await syncJournal(jdb, A, {}, { now: NOW })).legacyOpen, true);
});

test('a phone-scored sighting the server then identifies itself becomes a server-scored one, keeping the player\'s additions', async () => {
  const { jdb, row, wallFacts } = fakeDb(NOW - DAY); // after the window: the phone's word counts for nothing
  await importLegacy(jdb, A, 'upgrade-0001', claim({ points: 40 }), null, NOW);
  await applyEdits(jdb, row(A, 'upgrade-0001'), { science: { count: ['1'] }, wallPostId: '20000000-0000-4000-8000-0000000000a1' });
  assert.deepEqual([row(A, 'upgrade-0001').points, row(A, 'upgrade-0001').verified], [0, false]);
  // the app sends the photo through the identifier again, under the same sighting id
  const out = await recordSighting(jdb, sighting({ sid: 'upgrade-0001', id: { sci: 'Vulpes vulpes', common: 'Red fox', group: 'mammal', rarity: 0.5 } }));
  assert.ok(out.kind === 'recorded' && out.created);
  const r = row(A, 'upgrade-0001');
  assert.deepEqual([r.verified, r.points, r.science, r.wall_post_id, r.claimed_points], [true, 12, { count: ['1'] }, '20000000-0000-4000-8000-0000000000a1', 40]); // 6 + 5 first of species + 1 field note
  assert.deepEqual(wallFacts.get('20000000-0000-4000-8000-0000000000a1'), { points: 12, common_name: 'Red fox', scientific_name: 'Vulpes vulpes' });
  // and doing it again changes nothing
  const again = await recordSighting(jdb, sighting({ sid: 'upgrade-0001', id: { rarity: 1 } }));
  assert.ok(again.kind === 'recorded' && !again.created);
  assert.equal(row(A, 'upgrade-0001').points, 12);
});

test('a wall post shows its sighting\'s points, also after field notes change them', async () => {
  const { jdb, row, wallFacts } = fakeDb();
  const p = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, p);
  await applyEdits(jdb, row(A, p.sid), { wallPostId: '20000000-0000-4000-8000-0000000000b2' });
  assert.equal(wallFacts.get('20000000-0000-4000-8000-0000000000b2')!.points, 11);
  await applyEdits(jdb, row(A, p.sid), { science: { count: ['1'], habitat: ['forest'] } });
  assert.equal(wallFacts.get('20000000-0000-4000-8000-0000000000b2')!.points, 13);
});

test('an account created after the switch cannot claim phone-scored points at all', async () => {
  const { jdb, row, profiles } = fakeDb(); // window open, but no snapshot row for this account
  profiles.set(A, { points: 10_000, species_count: 99 }); // whatever it has written to the leaderboard itself
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `fake-${String(i).padStart(5, '0')}`, legacy: claim({ sci: madeUp(i), points: 500, observedAt: NOW - i * DAY }) }));
  const out = await syncJournal(jdb, A, { items }, { now: NOW });
  assert.equal(row(A, 'fake-00000').points, 0);
  assert.deepEqual(out.totals, { points: 0, speciesCount: 0 }); // nothing carried over, nothing claimed, no quests, no species
  assert.deepEqual(profiles.get(A), { points: 0, species_count: 0 });
});

test('after the legacy window, phone-scored sightings are kept but earn nothing: no points, no quests, no species', async () => {
  const { jdb, row, existing } = fakeDb(NOW - DAY);
  existing(A, 0, 20_000);
  await recordSighting(jdb, sighting({ id: { rarity: 0.5 } })); // one real sighting: 11 points
  await ensureReady(jdb, A, NOW);
  const before = (await refreshTotals(jdb, A, NOW))!;
  // six made-up sightings a week, going back months
  const items = Array.from({ length: 40 }, (_, i) => ({ id: `late-${String(i).padStart(5, '0')}`, legacy: claim({ sci: madeUp(i), group: i % 2 ? 'bird' : 'mammal', points: 500, observedAt: NOW - i * 1.2 * DAY }) }));
  const out = await syncJournal(jdb, A, { items }, { now: NOW });
  assert.deepEqual([row(A, 'late-00000').points, row(A, 'late-00000').claimed_points, row(A, 'late-00000').verified], [0, 500, false]);
  assert.deepEqual(out.totals, before);
});

test('phone-scored sightings, and the quests they complete, can add no more than the account\'s allowance', async () => {
  const { jdb, existing } = fakeDb();
  existing(A, 0, 300);
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `over-${String(i).padStart(5, '0')}`, legacy: claim({ sci: madeUp(i), group: i % 2 ? 'bird' : 'mammal', points: 400, observedAt: NOW - i * 1.5 * DAY }) }));
  const out = await syncJournal(jdb, A, { items }, { now: NOW });
  assert.equal(out.totals!.points, 300);
});

test('a field-note answer never re-scores a phone-scored sighting', async () => {
  const { jdb, row, existing } = fakeDb();
  existing(A, 0, 5000);
  // claims 1 point, with a made-up breakdown worth far more
  await importLegacy(jdb, A, 'legacy-brk1', { ...claim({ points: 1 }), score: { basePoints: 30, behaviorMultiplier: 8, bonuses: { firstOfSpecies: 5 } } } as any, null, NOW);
  const r = await applyEdits(jdb, row(A, 'legacy-brk1'), { science: { count: ['1'], habitat: ['forest'] } });
  assert.deepEqual([r.points, r.score, r.science], [1, null, { count: ['1'], habitat: ['forest'] }]);
});

// ---------- the player's own additions ----------
test('field notes earn a point per real question on a server-scored sighting, and can be taken back', async () => {
  const { jdb, row } = fakeDb();
  const p = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, p); // 11 points
  let r = await applyEdits(jdb, row(A, p.sid), { science: { count: ['2-5'], behavior: ['feeding', 'vocalizing'], junk: ['x'], habitat: ['the moon'] } });
  assert.equal(r.points, 13);
  assert.deepEqual(r.science, { count: ['2-5'], behavior: ['feeding', 'vocalizing'] });
  r = await applyEdits(jdb, row(A, p.sid), { science: { count: ['2-5'], behavior: ['feeding', 'vocalizing'] } }); // same again
  assert.equal(r.points, 13);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`q${i}`, ['1']]));
  r = await applyEdits(jdb, row(A, p.sid), { science: { ...many, count: ['1'], habitat: ['forest'], behavior: ['resting'], lifeStage: ['adult'] } });
  assert.equal(r.points, 11 + 4); // four questions exist
  r = await applyEdits(jdb, row(A, p.sid), { science: {} });
  assert.deepEqual([r.points, r.science], [11, null]);
});

test('a suggested species marks the sighting disputed; junk suggestions and post ids are ignored', async () => {
  const { jdb, row } = fakeDb();
  const p = sighting();
  await recordSighting(jdb, p);
  let r = await applyEdits(jdb, row(A, p.sid), { proposedSpecies: 'Bald eagle' });
  assert.deepEqual([r.status, r.proposed_species, r.points], ['disputed', 'Bald eagle', row(A, p.sid).points]);
  r = await applyEdits(jdb, row(A, p.sid), { proposedSpecies: 'http://spam.example', wallPostId: 'not-a-uuid' });
  assert.deepEqual([r.proposed_species, r.wall_post_id], ['Bald eagle', null]);
  for (const junk of ['www.spam.example', 'mail me at a@b.co', '12345', '', '   ', 42]) {
    assert.equal((await applyEdits(jdb, row(A, p.sid), { proposedSpecies: junk })).proposed_species, 'Bald eagle', String(junk));
  }
  // a suggestion that isn't a bare name is tidied, not dropped: the player meant something by it
  const q = sighting();
  await recordSighting(jdb, q);
  r = await applyEdits(jdb, row(A, q.sid), { proposedSpecies: 'Coyote?' });
  assert.deepEqual([r.status, r.proposed_species], ['disputed', 'Coyote']);
  r = await applyEdits(jdb, row(A, q.sid), { proposedSpecies: 'I think it is a coyote, not a dog' });
  assert.deepEqual([r.status, r.proposed_species], ['disputed', 'I think it is a coyote not']);
  r = await applyEdits(jdb, row(A, p.sid), { wallPostId: '20000000-0000-4000-8000-0000000000a1' });
  assert.equal(r.wall_post_id, '20000000-0000-4000-8000-0000000000a1');
  r = await applyEdits(jdb, row(A, p.sid), { wallPostId: null }); // un-shared
  assert.equal(r.wall_post_id, null);
});

// ---------- totals and the switch ----------
test('the switch takes nothing from the app: a number written to the leaderboard beforehand is not carried over', async () => {
  const { jdb, profiles, states } = fakeDb();
  profiles.set(A, { points: 10_000, species_count: 500 }); // set by a script, through the old rule
  const out = await syncJournal(jdb, A, {}, { now: NOW });
  assert.deepEqual([out.ready, out.totals], [true, { points: 0, speciesCount: 0 }]);
  assert.deepEqual([states.get(A)!.baseline_points, states.get(A)!.carryover_points], [0, 0]);
});

test('at the switch nobody\'s score drops, and the old journal arriving later is not counted twice', async () => {
  const { jdb, profiles, states, existing } = fakeDb();
  existing(A, 900, 20_000); // the database's snapshot: 900 on the board when the migration ran
  profiles.set(A, { points: 900, species_count: 30 });
  assert.equal(await refreshTotals(jdb, A, NOW), null); // not switched yet: the phone's number stands
  // First sync from an updated app, from a device with no journal on it (the web app, a second phone).
  let out = await syncJournal(jdb, A, {}, { now: NOW });
  assert.deepEqual([out.ready, out.totals?.points, profiles.get(A)!.points], [true, 900, 900]);
  // Later the phone that holds the journal syncs: 30 old sightings worth 20 each.
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `legacy-x${String(i).padStart(3, '0')}`, legacy: claim({ sci: madeUp(i), common: 'Thing', points: 20, observedAt: NOW - (i + 1) * DAY }) }));
  out = await syncJournal(jdb, A, { items }, { now: NOW });
  const journalWorth = out.totals!.points - states.get(A)!.carryover_points;
  assert.ok(journalWorth >= 600, `the journal alone is worth ${journalWorth}`);
  assert.equal(out.totals!.points, Math.max(900, journalWorth)); // not 900 + the journal
  assert.equal(states.get(A)!.carryover_points, Math.max(0, 900 - journalWorth));
  // A new sighting, identified by the server, adds to it.
  const before = out.totals!.points;
  await recordSighting(jdb, sighting({ id: { sci: 'Lynx rufus', common: 'Bobcat', group: 'mammal', rarity: 0.6 } }));
  const after = (await refreshTotals(jdb, A, NOW))!.points;
  assert.ok(after > before);
  // Deleting an old sighting lowers the score: what was carried over never grows back.
  const carried = states.get(A)!.carryover_points;
  await deleteSightings(jdb, A, ['legacy-x000'], NOW);
  const less = (await refreshTotals(jdb, A, NOW))!.points;
  assert.ok(less < after, `${less} < ${after}`);
  assert.equal(states.get(A)!.carryover_points, carried);
});

test('handing in the same photo again and again earns nothing anywhere (no quests, no species)', async () => {
  const { jdb } = fakeDb();
  const real = sighting({ id: { rarity: 0.5, group: 'bird' } });
  await recordSighting(jdb, real);
  await ensureReady(jdb, A, NOW);
  const before = (await refreshTotals(jdb, A, NOW))!;
  for (let i = 0; i < 12; i++) await recordSighting(jdb, sighting({ sha: real.sha, phash: real.phash, observedAt: NOW - i * DAY, id: { rarity: 0.5, group: 'bird' } }));
  assert.deepEqual(await refreshTotals(jdb, A, NOW), before);
});

test('an old date on a photo cannot complete weekly quests for weeks long gone', async () => {
  const { jdb, rows } = fakeDb();
  // Recorded today, but dated across twelve past weeks.
  for (let i = 0; i < 12; i++) {
    const p = sighting({ observedAt: NOW - (i + 2) * 7 * DAY, id: { sci: `Avis number${String.fromCharCode(97 + i)}`, common: 'Bird', group: 'bird', rarity: 0.3 } });
    await recordSighting(jdb, p);
    rows.set(`${A}/${p.sid}`, { ...rows.get(`${A}/${p.sid}`)!, recorded_at: new Date(NOW).toISOString() });
  }
  await ensureReady(jdb, A, NOW);
  const got = (await refreshTotals(jdb, A, NOW))!;
  const asRecorded = playerTotals(
    [...rows.values()].map((r) => ({ idStatus: r.status!, points: r.points, observedAt: NOW, species: { scientificName: r.scientific_name!, commonName: r.common_name!, group: r.taxon_group ?? undefined }, sceneTags: r.scene_tags, score: { basePoints: r.score!.basePoints } })),
    { seed: A, zone: ianaZone('UTC'), now: NOW },
  );
  assert.equal(got.points, asRecorded.points); // counted in the week they were handed in
});

test('totals are the shared quest rules run in the player\'s time zone', async () => {
  const { jdb, rows, profiles, states } = fakeDb();
  const species: [string, string][] = [['Turdus migratorius', 'bird'], ['Cyanocitta cristata', 'bird'], ['Cardinalis cardinalis', 'bird'], ['Vulpes vulpes', 'mammal'], ['Procyon lotor', 'mammal']];
  for (let i = 0; i < 12; i++) {
    const [sci, group] = species[i % species.length];
    await recordSighting(jdb, sighting({ observedAt: NOW - i * 0.9 * DAY, id: { sci, common: sci, group, rarity: 0.3 } }));
  }
  states.set(A, { user_id: A, tz: 'pacific/auckland', ready_at: new Date(NOW).toISOString(), baseline_points: 7, carryover_points: 7, legacy_allowance: 0, backup: 'yes', save_places: true, erased_at: null });
  const totals = (await refreshTotals(jdb, A, NOW))!;
  // (a sighting handed in more than a week after it was taken counts when it was handed in)
  const when = (r: JournalRow) => (Date.parse(r.recorded_at!) - Date.parse(r.observed_at) > 7 * DAY ? Date.parse(r.recorded_at!) : Date.parse(r.observed_at));
  const expected = playerTotals(
    [...rows.values()].map((r) => ({ idStatus: r.status!, points: r.points, observedAt: when(r), species: { scientificName: r.scientific_name!, commonName: r.common_name!, group: r.taxon_group ?? undefined }, sceneTags: r.scene_tags, score: { basePoints: r.score!.basePoints } })),
    { seed: A, zone: ianaZone('Pacific/Auckland'), now: NOW },
  );
  assert.equal(totals.points, expected.points + 7);
  assert.ok(expected.questPoints > 0);
  assert.deepEqual(profiles.get(A), { points: expected.points + 7, species_count: 5 });
});

// ---------- the sync endpoint's work ----------
test('sync: receipts are recorded as verified, the old journal as phone-scored, deletions applied, totals returned', async () => {
  const { jdb, row, rows, existing, states } = fakeDb();
  existing(A, 0, 5000);
  const verified = sighting({ sid: 'sync-ver-0001' });
  await recordSighting(jdb, sighting({ sid: 'sync-del-0001', id: { sci: 'Ardea herodias', common: 'Great blue heron' } }));
  const bad: string[] = [];
  const out = await syncJournal(jdb, A, {
    tz: 'america/new_york',
    deletes: ['sync-del-0001', '../../etc'],
    items: [
      { id: 'sync-ver-0001', receipt: signReceipt(verified), science: { count: ['1'] } },
      { id: 'sync-leg-0001', legacy: claim() },
      { id: 'sync-forged-01', receipt: `${signReceipt(verified)!.split('.')[0]}.AAAA` },
      { id: 'sync-moved-001', receipt: signReceipt(verified) }, // a real receipt, but for another sighting
      { id: 'bad id!', legacy: claim() },
    ],
  }, { now: NOW, onBadReceipt: (sid) => bad.push(sid) });
  assert.deepEqual(out.deleted, ['sync-del-0001']);
  const v = out.rows['sync-ver-0001'] as any;
  assert.deepEqual([v.verified, v.points, v.science], [true, row(A, 'sync-ver-0001').points, { count: ['1'] }]);
  // the app is not sent the server's own notes
  for (const hidden of ['flags', 'photo_sha', 'photo_phash', 'photo_mask', 'model', 'claimed_points']) assert.equal(hidden in v, false, hidden);
  assert.equal((out.rows['sync-leg-0001'] as any).verified, false);
  assert.deepEqual(out.rows['sync-forged-01'], { error: 'nothing to record' });
  assert.deepEqual(out.rows['sync-moved-001'], { error: 'nothing to record' });
  assert.deepEqual(bad, ['sync-forged-01', 'sync-moved-001']);
  assert.equal(Object.keys(out.rows).length, 4);
  assert.equal(rows.size, 3);
  assert.deepEqual([out.ready, out.legacyOpen, states.get(A)!.tz], [true, true, 'America/New_York']); // the zone under the server's own spelling
  assert.ok(out.totals && out.totals.points > 0 && out.totals.speciesCount === 2);
});

test('sync: a receipt for a photo someone else already logged comes back refused, not recorded', async () => {
  const { jdb, rows } = fakeDb();
  const original = sighting({ uid: B });
  await recordSighting(jdb, original);
  const copy = sighting({ uid: A, sid: 'sync-copy-001', sha: original.sha });
  const out = await syncJournal(jdb, A, { items: [{ id: 'sync-copy-001', receipt: signReceipt(copy) }] }, { now: NOW });
  assert.deepEqual(out.rows['sync-copy-001'], { refused: COPY_MESSAGES.copied });
  assert.equal(rows.size, 1);
});

test('sync: only a few photos are taken per request, and "purge" removes an account\'s stored photos', async () => {
  const { jdb, photos, existing } = fakeDb();
  existing(A, 0, 5000);
  const jpg = (i: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, i)]).toString('base64');
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `photo-${String(i).padStart(4, '0')}`, legacy: claim({ sci: madeUp(i) }), photoBase64: jpg(i) }));
  await syncJournal(jdb, A, { items }, { now: NOW });
  assert.equal(photos.size, MAX_SYNC_PHOTOS);
  photos.set(`${B}/keep-me`, Buffer.from('b'));
  await syncJournal(jdb, A, { purge: true }, { now: NOW });
  assert.deepEqual([...photos.keys()], [`${B}/keep-me`]);
});

test('recording at identify time does not switch an account or touch its score; its first sync does', async () => {
  const { jdb, profiles } = fakeDb();
  profiles.set(A, { points: 321, species_count: 9 });
  await recordSighting(jdb, sighting());
  assert.equal(await refreshTotals(jdb, A, NOW), null);
  assert.deepEqual(profiles.get(A), { points: 321, species_count: 9 });
  const out = await syncJournal(jdb, A, {}, { now: NOW });
  assert.equal(out.ready, true);
  assert.ok(out.totals!.points > 0);
});

// ---------- the player's choices ----------
test('nothing is stored for an account that has not said yes; saying yes is recorded on the account', async () => {
  const { jdb, rows, state, existing } = fakeDb(NOW + 30 * DAY, { backup: null, places: null });
  existing(A, 0, 5000);
  const item = { id: 'legacy-000001', legacy: claim() };
  const before = await syncJournal(jdb, A, { tz: 'Europe/Paris', items: [item] }, { now: NOW });
  assert.deepEqual([before.rows, before.prefs, before.ready, rows.size], [{}, { backup: null, places: false, placesSet: false, epoch: null }, false, 0]);
  assert.equal(state(A).tz, null); // not even the time zone
  const after = await syncJournal(jdb, A, { tz: 'Europe/Paris', prefs: { backup: 'yes', places: false }, items: [item] }, { now: NOW });
  assert.deepEqual(after.prefs, { backup: 'yes', places: false, placesSet: true, epoch: null }); // "off" was said, and is on record as said
  assert.equal(rows.size, 1);
  assert.deepEqual([state(A).backup, state(A).save_places === true, state(A).tz], ['yes', false, 'Europe/Paris']);
  // places off: the sighting is saved without where it was taken
  assert.deepEqual([[...rows.values()][0].lat, [...rows.values()][0].lng], [null, null]);
  // an answer that isn't yes or no changes nothing
  assert.deepEqual((await syncJournal(jdb, A, { prefs: { backup: 'maybe', places: 'yes' } }, { now: NOW })).prefs, { backup: 'yes', places: false, placesSet: true, epoch: null });
});

test('places: saved to two decimals when on; switching them off forgets the ones already saved', async () => {
  const { jdb, rows, row } = fakeDb(NOW + 30 * DAY, { backup: 'yes', places: true });
  const p = sighting({ lat: 44.123456, lng: -72.987654 });
  await syncJournal(jdb, A, { items: [{ id: p.sid, receipt: signReceipt(p) }, { id: 'legacy-000002', legacy: claim({ lat: 51.50074, lng: -0.12462 }) }] }, { now: NOW });
  assert.deepEqual([row(A, p.sid).lat, row(A, p.sid).lng], [44.12, -72.99]);
  assert.deepEqual([row(A, 'legacy-000002').lat, row(A, 'legacy-000002').lng], [51.5, -0.12]);
  const off = await syncJournal(jdb, A, { prefs: { places: false } }, { now: NOW });
  assert.equal(off.prefs.places, false);
  assert.ok([...rows.values()].every((r) => r.lat === null && r.lng === null));
  // and a sighting recorded from now on has none either
  const next = sighting();
  await syncJournal(jdb, A, { items: [{ id: next.sid, receipt: signReceipt(next) }] }, { now: NOW });
  assert.deepEqual([row(A, next.sid).lat, row(A, next.sid).lng], [null, null]);
});

test('turning the backup off stops new sightings being stored; a deletion is still honoured', async () => {
  const { jdb, rows, row } = fakeDb();
  const kept = sighting();
  await syncJournal(jdb, A, { items: [{ id: kept.sid, receipt: signReceipt(kept) }] }, { now: NOW });
  const off = await syncJournal(jdb, A, { prefs: { backup: 'no' } }, { now: NOW });
  assert.equal(off.prefs.backup, 'no');
  const late = sighting();
  const out = await syncJournal(jdb, A, { items: [{ id: late.sid, receipt: signReceipt(late) }] }, { now: NOW });
  assert.deepEqual([out.rows, rows.size], [{}, 1]); // what was saved stays; nothing new is added
  const del = await syncJournal(jdb, A, { deletes: [kept.sid, 'never-seen-000001'] }, { now: NOW });
  assert.deepEqual(del.deleted, [kept.sid, 'never-seen-000001']);
  assert.ok(row(A, kept.sid).deleted_at);
  // …but no marker is left for a sighting the server never had: with the backup off, nothing is on its way
  assert.equal(rows.has(`${A}/never-seen-000001`), false);
  assert.equal(rows.size, 1);
});

test('erase removes everything saved to the account: rows, markers, notes, photos and the time zone', async () => {
  const { jdb, rows, photos, refusals, profiles, state, existing } = fakeDb();
  existing(A, 300, 5000);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
  const shot = sighting({ sha: createHash('sha256').update(jpg).digest('hex') });
  const other = sighting({ uid: B });
  await recordSighting(jdb, other);
  await syncJournal(jdb, A, { tz: 'Europe/Paris', items: [{ id: shot.sid, receipt: signReceipt(shot), photoBase64: jpg.toString('base64') }, { id: 'legacy-000003', legacy: claim() }], deletes: ['gone-000001'] }, { now: NOW });
  await recordSighting(jdb, sighting({ uid: A, sha: other.sha, phash: other.phash })); // refused: leaves a note
  assert.deepEqual([[...rows.values()].filter((r) => r.user_id === A).length, photos.size, refusals.length], [3, 1, 1]);
  const out = await syncJournal(jdb, A, { erase: true }, { now: NOW });
  assert.deepEqual([[...rows.values()].filter((r) => r.user_id === A).length, photos.size, refusals.length], [0, 0, 0]);
  assert.deepEqual([state(A).tz, state(A).backup, state(A).save_places], [null, 'no', false]);
  // (the account's "epoch" changes, so other devices know to send their sightings afresh if the backup is ever turned on again)
  assert.deepEqual(out.prefs, { backup: 'no', places: false, placesSet: true, epoch: new Date(NOW).toISOString() });
  // someone else's journal is untouched
  assert.equal([...rows.values()].filter((r) => r.user_id === B).length, 1);
  // the score goes with the journal: nothing is left on the leaderboard, carried-over part included
  assert.deepEqual(profiles.get(A), { points: 0, species_count: 0 });
  assert.equal(state(A).carryover_points, 0);
  // nothing more is stored afterwards
  const again = sighting();
  assert.deepEqual((await syncJournal(jdb, A, { items: [{ id: again.sid, receipt: signReceipt(again) }] }, { now: NOW })).rows, {});
});

test('a stored photo that could not be removed is tried again; the marker says so until it is gone', async () => {
  const { jdb, row, photos, storage } = fakeDb();
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 3)]);
  const shot = sighting({ sha: createHash('sha256').update(jpg).digest('hex') });
  await recordSighting(jdb, shot, jpg.toString('base64'));
  storage.failing = true;
  await deleteSightings(jdb, A, [shot.sid], NOW);
  assert.deepEqual([Boolean(row(A, shot.sid).deleted_at), row(A, shot.sid).has_photo, photos.size], [true, true, 1]);
  storage.failing = false;
  await deleteSightings(jdb, A, [shot.sid], NOW + 1000); // the app's retry, or the nightly job
  assert.deepEqual([row(A, shot.sid).has_photo, photos.size], [false, 0]);
});

// ---------- found by the scoring review ----------
test('an account that switches after the legacy window keeps its score once: re-checked old sightings come off the carry-over', async () => {
  const { jdb, profiles, existing, state, row } = fakeDb(NOW - DAY); // the window has closed
  existing(A, 900, 20000);
  // the old journal arrives late: thirty sightings of ten species, worth nothing now
  const species = Array.from({ length: 10 }, (_, i) => `Avis numero${String.fromCharCode(97 + i)}`);
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `old-${String(i).padStart(4, '0')}`, legacy: claim({ sci: species[i % 10], common: species[i % 10], group: 'bird', points: 30, observedAt: NOW - (40 + i) * DAY, loggedAt: NOW - (40 + i) * DAY }) }));
  let out = await syncJournal(jdb, A, { items }, { now: NOW });
  assert.equal(out.totals!.points, 900); // the whole baseline is carried over
  // the server identifies them itself, one by one (the app sends each photo again)
  const seen: number[] = [];
  for (let i = 0; i < 30; i++) {
    await recordSighting(jdb, sighting({ sid: items[i].id, id: { sci: species[i % 10], common: species[i % 10], group: 'bird', rarity: 0.5 } }));
    seen.push((await refreshTotals(jdb, A, NOW))!.points);
  }
  // the score never drops and never doubles: what the re-checked sightings now earn comes off what was carried over
  assert.ok(seen.every((p) => p >= 900), `dropped: ${Math.min(...seen)}`);
  const earned = [...Array(30).keys()].reduce((n, i) => n + row(A, items[i].id).points, 0);
  assert.ok(earned > 100, String(earned));
  assert.ok(seen[29] <= Math.max(900, earned + 400), `rose to ${seen[29]} with ${earned} earned`); // (+ quest rewards at most)
  assert.ok(seen[29] < 900 + earned, `counted twice: ${seen[29]}`);
  assert.ok(state(A).carryover_points < 900);
  assert.equal(profiles.get(A)!.points, seen[29]);
  out = await syncJournal(jdb, A, {}, { now: NOW });
  assert.equal(out.totals!.points, seen[29]); // stable
});

test('old sightings the server re-checks are scored in order: the first of a species gets its bonus, not "third of three"', async () => {
  const { jdb, row } = fakeDb(NOW - DAY); // window closed: the phone-scored rows are worth nothing
  const ids = ['robin-000001', 'robin-000002', 'robin-000003', 'squirrel-0001'];
  const names = ['Turdus migratorius', 'Turdus migratorius', 'Turdus migratorius', 'Sciurus carolinensis'];
  await syncJournal(jdb, A, { items: ids.map((id, i) => ({ id, legacy: claim({ sci: names[i], common: names[i], points: 11 }) })) }, { now: NOW });
  assert.deepEqual(ids.map((id) => row(A, id).points), [0, 0, 0, 0]);
  for (const [i, id] of ids.entries()) await recordSighting(jdb, sighting({ sid: id, id: { sci: names[i], common: names[i], rarity: 0.5 } }));
  assert.deepEqual(ids.map((id) => row(A, id).points), [11, 3, 2, 11]); // as if the server had identified them in the first place
  assert.deepEqual(ids.map((id) => row(A, id).score!.bonuses.firstOfSpecies), [5, 0, 0, 5]);
  // a phone-scored sighting that IS worth something still counts as an earlier sighting of its species
  const second = fakeDb();
  second.existing(A, 0, 5000);
  await syncJournal(second.jdb, A, { items: [{ id: 'heron-000001', legacy: claim({ sci: 'Ardea herodias', common: 'Great blue heron', points: 12 }) }] }, { now: NOW });
  const fresh2 = sighting({ id: { sci: 'Ardea herodias', common: 'Great blue heron', rarity: 0.5 } });
  await recordSighting(second.jdb, fresh2);
  assert.equal(second.row(A, fresh2.sid).score!.bonuses.firstOfSpecies, 0);
  // and a deleted server-identified sighting still does (delete-and-re-add can't bring the bonus back)
  await deleteSightings(jdb, A, ['squirrel-0001'], NOW);
  const again = sighting({ id: { sci: 'Sciurus carolinensis', common: 'Eastern gray squirrel', rarity: 0.5 } });
  await recordSighting(jdb, again);
  assert.equal(row(A, again.sid).score!.bonuses.firstOfSpecies, 0);
});

test('a phone-scored sighting can complete "a rare find" with the base points the phone reported, inside the allowance', async () => {
  const withBase = fakeDb();
  withBase.existing(A, 0, 5000);
  const without = fakeDb();
  without.existing(A, 0, 5000);
  // the same old journal, once with the phone's score breakdown and once without
  const week = Array.from({ length: 6 }, (_, i) => ({ observedAt: NOW - (2 + i * 7) * DAY, loggedAt: NOW - (2 + i * 7) * DAY }));
  const items = (score: boolean) => week.map((w, i) => ({ id: `rare-${String(i).padStart(5, '0')}`, legacy: claim({ ...w, sci: madeUp(i), common: madeUp(i), points: 26, ...(score ? { score: { basePoints: 21, totalPoints: 26 } } : {}) }) }));
  const a = await syncJournal(withBase.jdb, A, { tz: 'UTC', items: items(true) }, { now: NOW });
  const b = await syncJournal(without.jdb, A, { tz: 'UTC', items: items(false) }, { now: NOW });
  assert.ok(a.totals!.points >= b.totals!.points);
  // (whether a given week had the rare-find quest depends on that week's draw; over six weeks at least one did)
  assert.ok(a.totals!.points > b.totals!.points, `${a.totals!.points} vs ${b.totals!.points}`);
  // nothing is ever recomputed into points from it, and it stays inside the allowance
  assert.ok([...withBase.rows.values()].every((r) => r.points === 26 && r.score === null));
  const capped = fakeDb();
  capped.existing(A, 0, 50);
  const c = await syncJournal(capped.jdb, A, { tz: 'UTC', items: items(true) }, { now: NOW });
  assert.equal(c.totals!.points, 50);
});

test('the species count shown at the switch is carried over with the score, until the old journal is accounted for', async () => {
  const { jdb, states, state, existing } = fakeDb(NOW - DAY); // window closed
  existing(A, 300, 20000);
  states.set(A, { ...state(A), baseline_species: 12 });
  const out = await syncJournal(jdb, A, { items: [{ id: 'old-000001', legacy: claim({ points: 20 }) }] }, { now: NOW });
  assert.deepEqual(out.totals, { points: 300, speciesCount: 12 }); // not "300 points, 0 species"
  // a new account has no baseline, and shows what it has
  const fresh3 = fakeDb();
  const p = sighting();
  await recordSighting(fresh3.jdb, p);
  assert.equal((await syncJournal(fresh3.jdb, A, {}, { now: NOW })).totals!.speciesCount, 1);
});

test('a phone-scored sighting dated before the app existed counts for quests when it was handed in, not in a week long gone', async () => {
  const dated = fakeDb();
  dated.existing(A, 0, 5000);
  const today = fakeDb();
  today.existing(A, 0, 5000);
  const old = Date.UTC(2019, 4, 6, 12);
  const items = (observedAt: number) => Array.from({ length: 6 }, (_, i) => ({ id: `past-${String(i).padStart(5, '0')}`, legacy: claim({ observedAt: observedAt + i * 3600_000, loggedAt: NOW - DAY, sci: madeUp(i), common: madeUp(i), points: 10 }) }));
  const a = await syncJournal(dated.jdb, A, { tz: 'UTC', items: items(old) }, { now: NOW });
  const b = await syncJournal(today.jdb, A, { tz: 'UTC', items: items(NOW - 2 * 3600_000 - 6 * 3600_000) }, { now: NOW });
  assert.equal(a.totals!.points, b.totals!.points); // six sightings in 2019 earn what six sightings handed in today earn
  assert.equal(Date.parse(dated.row(A, 'past-00000').observed_at), old); // while the journal keeps the photo's own date
});

// ---------- the phone shows what the server counts ----------
test('quest progress on the phone follows the server: the same sightings count, in the same weeks, for the same rewards', async () => {
  const { jdb, rows, existing } = fakeDb();
  existing(A, 0, 5000); // room for phone-scored sightings, no old score to carry over
  const at = (sid: string, recorded: number) => rows.set(`${A}/${sid}`, { ...rows.get(`${A}/${sid}`)!, recorded_at: new Date(recorded).toISOString() });
  const record = async (over: Parameters<typeof sighting>[0], recorded = NOW - 3600_000) => {
    const p = sighting(over);
    await recordSighting(jdb, p);
    at(p.sid, recorded);
    return p;
  };
  // Taken and handed in this week.
  const first = await record({ observedAt: NOW - 2 * DAY, id: { sci: 'Turdus migratorius', common: 'American robin', group: 'bird', rarity: 0.3 } });
  await record({ observedAt: NOW - DAY, id: { sci: 'Vulpes vulpes', common: 'Red fox', group: 'mammal', rarity: 0.6, tags: ['hunting'] } });
  // The same file again: kept, worth nothing.
  const again = await record({ sha: first.sha, phash: first.phash, observedAt: NOW - DAY, id: { sci: 'Turdus migratorius', common: 'American robin', group: 'bird', rarity: 0.3 } });
  assert.equal(rows.get(`${A}/${again.sid}`)!.points, 0);
  // From the camera roll, taken weeks ago, handed in today: four more species.
  for (let i = 0; i < 4; i++) await record({ capture: 'library', cameraEvidence: true, observedAt: NOW - (20 + i) * DAY, id: { sci: madeUp(i), common: madeUp(i), group: i % 2 ? 'bird' : 'mammal', rarity: 0.3 } });
  // Taken six days before it was handed in: still counts in its own week.
  await record({ observedAt: NOW - 30 * DAY, id: { sci: madeUp(9), common: madeUp(9), group: 'bird', rarity: 0.3 } }, NOW - 24 * DAY);
  // The old journal, scored on the phone: some from this autumn, some dated before the app existed.
  await syncJournal(jdb, A, {
    tz: 'UTC',
    items: [
      { id: 'old-00001', legacy: claim({ observedAt: NOW - 40 * DAY, loggedAt: NOW - 40 * DAY, sci: madeUp(11), common: madeUp(11), group: 'bird', points: 9 }) },
      { id: 'old-00002', legacy: claim({ observedAt: Date.UTC(2019, 4, 6, 12), loggedAt: NOW - 39 * DAY, sci: madeUp(12), common: madeUp(12), group: 'reptile', points: 9 }) },
      { id: 'old-00003', legacy: claim({ observedAt: Date.UTC(2019, 4, 7, 12), loggedAt: NOW - 39 * DAY, sci: madeUp(13), common: madeUp(13), group: 'amphibian', points: 0 }) },
    ],
  }, { now: NOW });
  const server = (await refreshTotals(jdb, A, NOW))!;

  // A phone that has just pulled this journal:
  const phone = [...rows.values()].filter((r) => !r.deleted_at).map((r) => fromCloudRow(publicRow(r) as unknown as CloudRow, NOW));
  const opts = { seed: A, zone: ianaZone('UTC'), now: NOW };
  const counted = playerTotals(asTheServerCounts(phone), opts);
  assert.deepEqual({ points: counted.points, speciesCount: counted.speciesCount }, { points: server.points, speciesCount: server.speciesCount });
  assert.ok(counted.questPoints > 0);
  // Counting the journal as it stands would say something else, on both counts
  // (the photo handed in twice and the 0-point import; the weeks of the late ones).
  const asItStands = playerTotals(phone, opts);
  assert.notEqual(asItStands.questPoints, counted.questPoints);
  assert.equal(asTheServerCounts(phone).length, phone.length - 2);
  // What the journal shows is not touched: the list is for counting only.
  const late = phone.find((s) => s.species?.scientificName === madeUp(0))!;
  assert.equal(late.observedAt, NOW - 20 * DAY);
  assert.equal(asTheServerCounts(phone).find((s) => s.id === late.id)!.observedAt, NOW - 3600_000);
});
