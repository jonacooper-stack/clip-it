// The rules of the cloud journal (api/_lib/journal.ts), run against an
// in-memory stand-in for the database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  applyEdits, cleanScience, COPY_MESSAGES, deleteSightings, ensureReady, importLegacy, MAX_CARRYOVER, MAX_LEGACY_POINTS, recordSighting,
  refreshTotals, syncJournal, type JournalDb, type JournalRow, type JournalState,
} from '../api/_lib/journal';
import { signReceipt, type ReceiptPayload } from '../api/_lib/receipt';
import { LIBRARY_HASHES } from '../api/_lib/libraryHashes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { hamming, photoFingerprint } from '../api/_lib/phash';
import { playerTotals } from '../shared/quests';
import { ianaZone } from '../shared/zone';

process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const NOW = Date.parse('2026-11-12T15:00:00Z');
const DAY = 86_400_000;

function fakeDb(legacyUntil: number | null = NOW + 30 * DAY) {
  const rows = new Map<string, JournalRow>();
  const states = new Map<string, JournalState>();
  const profiles = new Map<string, { points: number; species_count: number }>();
  const photos = new Map<string, Buffer>();
  const key = (uid: string, sid: string) => `${uid}/${sid}`;
  const jdb: JournalDb = {
    async getRow(uid, sid) { return rows.get(key(uid, sid)) ?? null; },
    async liveRows(uid) { return [...rows.values()].filter((r) => r.user_id === uid && !r.deleted_at); },
    async speciesCount(uid, sci, except) { return [...rows.values()].filter((r) => r.user_id === uid && r.scientific_name === sci && r.id !== except).length; },
    async lookAlikes(sci, sha) {
      return [...rows.values()]
        .filter((r) => (r.scientific_name === sci && r.photo_phash) || (sha && r.photo_sha === sha))
        .map((r) => ({ user_id: r.user_id, id: r.id, photo_sha: r.photo_sha, photo_phash: r.photo_phash }));
    },
    async insertRow(row) {
      if (rows.has(key(row.user_id, row.id))) return false;
      rows.set(key(row.user_id, row.id), { ...row });
      return true;
    },
    async updateRow(uid, sid, patch) { rows.set(key(uid, sid), { ...rows.get(key(uid, sid))!, ...patch }); },
    async getState(uid) { return states.get(uid) ?? null; },
    async saveState(uid, patch) { states.set(uid, { user_id: uid, tz: null, ready_at: null, baseline_points: 0, carryover_points: 0, legacy_points: 0, ...states.get(uid), ...patch }); },
    async profilePoints(uid) { return profiles.get(uid)?.points ?? null; },
    async setProfileTotals(uid, points, species_count) { profiles.set(uid, { points, species_count }); },
    async legacyUntil() { return legacyUntil; },
    async putPhoto(uid, sid, bytes) { photos.set(key(uid, sid), bytes); return true; },
    async removePhotos(uid, sids) { for (const s of sids) photos.delete(key(uid, s)); },
  };
  return { jdb, rows, states, profiles, photos, row: (uid: string, sid: string) => rows.get(key(uid, sid))! };
}

// A 256-bit fingerprint with a real pattern, and copies of it a few bits away.
const PRINT = 'a5c3'.repeat(16);
const flip = (h: string, bits: number) => h.split('').map((c, i) => (i < bits ? (parseInt(c, 16) ^ 1).toString(16) : c)).join('');
let n = 0;
const sighting = (over: Omit<Partial<ReceiptPayload>, 'id'> & { id?: Partial<ReceiptPayload['id']> } = {}): ReceiptPayload => {
  n++;
  const { id, ...rest } = over;
  return {
    v: 1, uid: A, sid: `sight-${n}-abc`, at: NOW, observedAt: NOW - 3600_000, loggedAt: NOW - 3000_000, lat: 44.1, lng: -72.5, accuracyM: 10,
    capture: 'camera', cameraEvidence: null,
    id: { status: 'ai_confident', common: 'Osprey', sci: 'Pandion haliaetus', group: 'bird', confidence: 0.93, rarity: 0.4, tags: [], dangerous: false, caption: 'An osprey.', ...id },
    sha: createHash('sha256').update(`photo-${n}`).digest('hex'), phash: flip(PRINT, 0).replace(/^.{8}/, (n * 2654435761 >>> 0).toString(16).padStart(8, '0')), flags: null, model: 'test', ...rest,
  };
};

test('a recorded sighting is scored by the server, and recording it twice changes nothing', async () => {
  const { jdb, row } = fakeDb();
  const p = sighting({ id: { rarity: 0.5, tags: ['in_flight'] } });
  const first = await recordSighting(jdb, p);
  assert.equal(first.kind, 'recorded');
  const r = row(A, p.sid);
  assert.equal(r.verified, true);
  assert.equal(r.score!.basePoints, 6); // 1 + 20 × 0.5²
  assert.equal(r.score!.behaviorMultiplier, 1.5);
  assert.equal(r.score!.bonuses.firstOfSpecies, 5);
  assert.equal(r.points, 14); // round(6 × 1.5) + 5
  assert.deepEqual([r.lat, r.lng, r.status, r.scientific_name], [44.1, -72.5, 'ai_confident', 'Pandion haliaetus']);
  const again = await recordSighting(jdb, { ...p, id: { ...p.id, rarity: 1 } }); // a retry, or a tampered resend
  assert.equal(again.kind === 'recorded' && again.created, false);
  assert.equal(row(A, p.sid).points, 14);
});

test('a species seen before is worth less each time; a dangerous animal gets no behaviour bonus', async () => {
  const { jdb, row } = fakeDb();
  const one = sighting({ id: { rarity: 0.5 } });
  const two = sighting({ id: { rarity: 0.5 } });
  const three = sighting({ id: { rarity: 0.5 } });
  for (const p of [one, two, three]) await recordSighting(jdb, p);
  assert.deepEqual([row(A, one.sid).points, row(A, two.sid).points, row(A, three.sid).points], [11, 3, 2]); // 6+5, 6/2, 6/3
  const bear = sighting({ id: { sci: 'Ursus arctos', common: 'Brown bear', rarity: 0.5, tags: ['with_young'], dangerous: true } });
  await recordSighting(jdb, bear);
  assert.equal(row(A, bear.sid).score!.behaviorMultiplier, 1);
  assert.deepEqual(row(A, bear.sid).scene_tags, ['with_young']); // still recorded as seen
});

test('a photo another player already logged is refused, exact or re-saved', async () => {
  const { jdb, rows } = fakeDb();
  const original = sighting({ uid: A });
  await recordSighting(jdb, original);
  const exact = await recordSighting(jdb, sighting({ uid: B, sha: original.sha, phash: null }));
  assert.deepEqual(exact, { kind: 'refused', reason: 'copied', message: COPY_MESSAGES.copied });
  const resaved = await recordSighting(jdb, sighting({ uid: B, phash: flip(original.phash!, 15) }));
  assert.equal(resaved.kind, 'refused');
  const different = await recordSighting(jdb, sighting({ uid: B, phash: flip(original.phash!, 60) }));
  assert.equal(different.kind, 'recorded');
  assert.equal([...rows.values()].filter((r) => r.user_id === B).length, 1);
});

test('one of Scout\'s own library photos is refused', async () => {
  const { jdb } = fakeDb();
  const libraryPhoto = Object.values(LIBRARY_HASHES)[7];
  const out = await recordSighting(jdb, sighting({ phash: flip(libraryPhoto, 10) }));
  assert.deepEqual(out, { kind: 'refused', reason: 'library', message: COPY_MESSAGES.library });
});

test('the player\'s own photo again scores nothing; a different frame of the same animal scores as a repeat', async () => {
  const { jdb, row } = fakeDb();
  const first = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, first);
  const same = sighting({ id: { rarity: 0.5 }, phash: flip(first.phash!, 2) }); // the same picture, re-saved
  await recordSighting(jdb, same);
  assert.equal(row(A, same.sid).points, 0);
  assert.equal(row(A, same.sid).score!.repeatMultiplier, 0);
  const burst = sighting({ id: { rarity: 0.5 }, phash: flip(first.phash!, 15) }); // the next frame of a burst
  assert.equal(hamming(burst.phash, first.phash), 15);
  await recordSighting(jdb, burst);
  assert.equal(row(A, burst.sid).points, 2); // third of the species: 6 / 3
});

test('deleting empties the sighting but its species and fingerprints still count against re-adding', async () => {
  const { jdb, row, photos } = fakeDb();
  const first = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, first, Buffer.from('not really a jpeg').toString('base64'));
  assert.deepEqual(await deleteSightings(jdb, A, [first.sid], NOW), [first.sid]);
  const gone = row(A, first.sid);
  assert.ok(gone.deleted_at);
  assert.deepEqual([gone.lat, gone.lng, gone.caption, gone.common_name, gone.points, gone.status], [null, null, null, null, 0, null]);
  assert.equal(gone.scientific_name, 'Pandion haliaetus');
  assert.equal(photos.size, 0);
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

test('the stored photo must be the one that was identified', async () => {
  const { jdb, photos, row } = fakeDb();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 9)]);
  const p = sighting({ sha: createHash('sha256').update(jpeg).digest('hex') });
  await recordSighting(jdb, p, Buffer.concat([jpeg, Buffer.from([1])]).toString('base64')); // some other picture
  assert.equal(photos.size, 0);
  assert.equal(row(A, p.sid).has_photo, false);
  const q = sighting({ sha: createHash('sha256').update(jpeg).digest('hex'), id: { sci: 'Ardea herodias', common: 'Great blue heron' } });
  await recordSighting(jdb, q, jpeg.toString('base64'));
  assert.equal(row(A, q.sid).has_photo, true);
  assert.equal(photos.get(`${A}/${q.sid}`)!.length, jpeg.length);
});

test('a photo sent later for a recorded sighting is accepted when it is the same picture, re-saved', async () => {
  const { jdb, photos, row } = fakeDb();
  const original = readFileSync(join(__dirname, '..', 'site', 'img', 'library', 'osprey.jpg'));
  const print = photoFingerprint(original.toString('base64'));
  // (a library photo stands in for a player's photo here, so skip the "one of Scout's photos" rule by recording directly)
  const p = sighting({ sha: print.sha, phash: print.phash });
  await jdb.insertRow({ ...(await rowFor(p)), verified: true });
  const img = jpeg.decode(original, { useTArray: true });
  const resaved = jpeg.encode(img as any, 60).data.toString('base64');
  const other = readFileSync(join(__dirname, '..', 'site', 'img', 'library', 'bison.jpg')).toString('base64');
  await syncJournal(jdb, A, { items: [{ id: p.sid, photoBase64: other }] }, NOW);
  assert.equal(row(A, p.sid).has_photo, false); // a different picture is not stored against it
  await syncJournal(jdb, A, { items: [{ id: p.sid, photoBase64: resaved }] }, NOW);
  assert.equal(row(A, p.sid).has_photo, true);
  assert.equal(photos.size, 1);
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

// The row recordSighting would write for a payload, without the checks (for tests that need a row in place).
async function rowFor(p: ReceiptPayload): Promise<JournalRow> {
  const scratch = fakeDb();
  await recordSighting(scratch.jdb, { ...p, phash: null, sha: null });
  return { ...scratch.row(p.uid, p.sid), photo_sha: p.sha, photo_phash: p.phash };
}

const claim = (over: Record<string, unknown> = {}) => ({
  observedAt: NOW - 20 * DAY, loggedAt: NOW - 20 * DAY, lat: 44, lng: -72, status: 'ai_confident', common: 'Red fox', sci: 'Vulpes vulpes', group: 'mammal',
  confidence: 0.9, tags: ['in_flight', 'made_up_tag'], caption: 'A fox at dusk.', points: 12, score: { basePoints: 7, behaviorMultiplier: 1, bonuses: { firstOfSpecies: 5 }, totalPoints: 12, ruleVersion: 'scoring-v1' }, ...over,
});

test('a journal built up on the phone is accepted once, during the legacy window, marked as not verified', async () => {
  const { jdb, row, states } = fakeDb();
  const out = await importLegacy(jdb, A, 'legacy-aaa1', claim(), null, NOW);
  assert.equal(out.kind, 'recorded');
  const r = row(A, 'legacy-aaa1');
  assert.deepEqual([r.verified, r.points, r.scientific_name, r.taxon_group], [false, 12, 'Vulpes vulpes', 'mammal']);
  assert.deepEqual(r.scene_tags, ['in_flight']); // unknown tags dropped
  assert.equal(states.get(A)!.legacy_points, 12);
  // sending it again doesn't add the points twice
  await importLegacy(jdb, A, 'legacy-aaa1', claim({ points: 400 }), null, NOW);
  assert.equal(row(A, 'legacy-aaa1').points, 12);
  assert.equal(states.get(A)!.legacy_points, 12);
});

test('what the phone claims is bounded: per sighting, per account, and by what a name may be', async () => {
  const { jdb, row, states } = fakeDb();
  await importLegacy(jdb, A, 'legacy-big1', claim({ points: 999_999 }), null, NOW);
  assert.equal(row(A, 'legacy-big1').points, 500);
  assert.equal((await importLegacy(jdb, A, 'legacy-bad1', claim({ sci: '<script>alert(1)</script>' }), null, NOW)).kind, 'invalid');
  assert.equal((await importLegacy(jdb, A, 'legacy-bad2', claim({ sci: 'Fuck', common: 'x' }), null, NOW)).kind, 'invalid');
  assert.equal((await importLegacy(jdb, A, 'legacy-bad3', claim({ status: 'ineligible' }), null, NOW)).kind, 'invalid');
  await importLegacy(jdb, A, 'legacy-cap1', claim({ caption: 'what the fuck' }), null, NOW);
  assert.equal(row(A, 'legacy-cap1').caption, null);
  // the account-wide cap
  states.set(A, { ...states.get(A)!, legacy_points: MAX_LEGACY_POINTS - 5 });
  await importLegacy(jdb, A, 'legacy-cap2', claim({ points: 200 }), null, NOW);
  assert.equal(row(A, 'legacy-cap2').points, 5);
  await importLegacy(jdb, A, 'legacy-cap3', claim({ points: 200 }), null, NOW);
  assert.equal(row(A, 'legacy-cap3').points, 0); // kept in the journal, worth nothing
});

test('after the legacy window, a sighting the server did not identify is kept but scores nothing', async () => {
  const { jdb, row } = fakeDb(NOW - DAY);
  await importLegacy(jdb, A, 'late-0001', claim(), null, NOW);
  assert.deepEqual([row(A, 'late-0001').points, row(A, 'late-0001').score, row(A, 'late-0001').verified], [0, null, false]);
  const none = fakeDb(null);
  await importLegacy(none.jdb, A, 'late-0002', claim(), null, NOW);
  assert.equal(none.row(A, 'late-0002').points, 0);
});

test('field notes earn a point each, up to a few, and can be taken back', async () => {
  const { jdb, row } = fakeDb();
  const p = sighting({ id: { rarity: 0.5 } });
  await recordSighting(jdb, p); // 11 points
  let r = await applyEdits(jdb, row(A, p.sid), { science: { count: ['2'], behavior: ['feeding', 'calling'], junk: [], 'bad key!': ['x'] } });
  assert.equal(r.points, 13);
  assert.deepEqual(r.science, { count: ['2'], behavior: ['feeding', 'calling'] });
  r = await applyEdits(jdb, row(A, p.sid), { science: { count: ['2'], behavior: ['feeding', 'calling'] } }); // same again
  assert.equal(r.points, 13);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`q${String.fromCharCode(97 + i)}`, ['x']]));
  r = await applyEdits(jdb, row(A, p.sid), { science: many });
  assert.equal(r.points, 11 + 6); // capped
  r = await applyEdits(jdb, row(A, p.sid), { science: {} });
  assert.deepEqual([r.points, r.science], [11, null]);
  assert.equal(cleanScience('nope'), null);
  assert.equal(cleanScience({ count: [{ evil: true }, 'ok'] })!.count.length, 1);
});

test('a suggested species marks the sighting disputed; junk suggestions and post ids are ignored', async () => {
  const { jdb, row } = fakeDb();
  const p = sighting();
  await recordSighting(jdb, p);
  let r = await applyEdits(jdb, row(A, p.sid), { proposedSpecies: 'Bald eagle' });
  assert.deepEqual([r.status, r.proposed_species, r.points], ['disputed', 'Bald eagle', row(A, p.sid).points]);
  r = await applyEdits(jdb, row(A, p.sid), { proposedSpecies: 'http://spam.example', wallPostId: 'not-a-uuid' });
  assert.deepEqual([r.proposed_species, r.wall_post_id], ['Bald eagle', null]);
  r = await applyEdits(jdb, row(A, p.sid), { wallPostId: '20000000-0000-4000-8000-0000000000a1' });
  assert.equal(r.wall_post_id, '20000000-0000-4000-8000-0000000000a1');
});

test('at the switch nobody\'s score drops, and the old journal arriving later is not counted twice', async () => {
  const { jdb, profiles, states } = fakeDb();
  profiles.set(A, { points: 900, species_count: 30 }); // what the phone had reported
  assert.equal(await refreshTotals(jdb, A, NOW), null); // not switched yet: the phone's number stands
  // First sync from an updated app, from a device with no journal on it (the web app, a second phone).
  let out = await syncJournal(jdb, A, {}, NOW);
  assert.deepEqual([out.ready, out.totals?.points, profiles.get(A)!.points], [true, 900, 900]);
  assert.deepEqual([states.get(A)!.baseline_points, states.get(A)!.carryover_points], [900, 900]);
  // Later the phone that holds the journal syncs: 30 old sightings worth 20 each.
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `legacy-x${String(i).padStart(3, '0')}`, legacy: claim({ sci: `Species number${String.fromCharCode(97 + (i % 26))}${i > 25 ? 'b' : ''}`, common: 'Thing', points: 20, observedAt: NOW - (i + 1) * DAY }) }));
  out = await syncJournal(jdb, A, { items }, NOW);
  const journalWorth = out.totals!.points - states.get(A)!.carryover_points;
  assert.ok(journalWorth >= 600, `the journal alone is worth ${journalWorth}`);
  assert.equal(out.totals!.points, Math.max(900, journalWorth)); // not 900 + the journal
  assert.equal(states.get(A)!.carryover_points, Math.max(0, 900 - journalWorth));
  // A new sighting, identified by the server, adds to it.
  const before = out.totals!.points;
  const fresh = sighting({ id: { sci: 'Lynx rufus', common: 'Bobcat', group: 'mammal', rarity: 0.6 } });
  await recordSighting(jdb, fresh);
  const after = (await refreshTotals(jdb, A, NOW))!.points;
  assert.ok(after > before);
  // Deleting an old sighting lowers the score: what was carried over never grows back.
  const carried = states.get(A)!.carryover_points;
  await deleteSightings(jdb, A, ['legacy-x000'], NOW);
  const less = (await refreshTotals(jdb, A, NOW))!.points;
  assert.ok(less < after, `${less} < ${after}`);
  assert.equal(states.get(A)!.carryover_points, carried);
});

test('carried-over points are bounded, and switching twice changes nothing', async () => {
  const { jdb, profiles, states } = fakeDb();
  profiles.set(A, { points: 4_999_999, species_count: 1 }); // an inflated claim
  await ensureReady(jdb, A, NOW);
  assert.equal(states.get(A)!.carryover_points, MAX_CARRYOVER);
  const first = { ...states.get(A)! };
  profiles.set(A, { points: 5, species_count: 1 });
  await ensureReady(jdb, A, NOW + 5000);
  assert.deepEqual(states.get(A), first);
  // an account with no profile row yet starts from nothing
  await ensureReady(jdb, B, NOW);
  assert.deepEqual([states.get(B)!.baseline_points, states.get(B)!.carryover_points], [0, 0]);
});

test('totals are the shared quest rules run in the player\'s time zone', async () => {
  const { jdb, rows, profiles, states } = fakeDb();
  const species: [string, string][] = [['Turdus migratorius', 'bird'], ['Cyanocitta cristata', 'bird'], ['Cardinalis cardinalis', 'bird'], ['Vulpes vulpes', 'mammal'], ['Procyon lotor', 'mammal']];
  for (let i = 0; i < 12; i++) {
    const [sci, group] = species[i % species.length];
    await recordSighting(jdb, sighting({ observedAt: NOW - i * 0.9 * DAY, id: { sci, common: sci, group, rarity: 0.3 } }));
  }
  states.set(A, { user_id: A, tz: 'Pacific/Auckland', ready_at: new Date(NOW).toISOString(), baseline_points: 7, carryover_points: 7, legacy_points: 0 });
  const totals = (await refreshTotals(jdb, A, NOW))!;
  const expected = playerTotals(
    [...rows.values()].map((r) => ({ idStatus: r.status!, points: r.points, observedAt: Date.parse(r.observed_at), species: { scientificName: r.scientific_name!, commonName: r.common_name!, group: r.taxon_group ?? undefined }, sceneTags: r.scene_tags, score: { basePoints: r.score!.basePoints } })),
    { seed: A, zone: ianaZone('Pacific/Auckland'), now: NOW },
  );
  assert.equal(totals.points, expected.points + 7);
  assert.ok(expected.questPoints > 0);
  assert.deepEqual(profiles.get(A), { points: expected.points + 7, species_count: 5 });
});

test('sync: receipts are recorded as verified, the old journal as legacy, deletions applied, totals returned', async () => {
  const { jdb, row, rows } = fakeDb();
  const verified = sighting({ sid: 'sync-ver-0001' });
  await recordSighting(jdb, sighting({ sid: 'sync-del-0001', id: { sci: 'Ardea herodias', common: 'Great blue heron' } }));
  const out = await syncJournal(jdb, A, {
    tz: 'America/New_York',
    deletes: ['sync-del-0001', '../../etc'],
    items: [
      { id: 'sync-ver-0001', receipt: signReceipt(verified), science: { count: ['1'] } },
      { id: 'sync-leg-0001', legacy: claim() },
      { id: 'sync-forged-01', receipt: `${signReceipt(verified)!.split('.')[0]}.AAAA` },
      { id: 'sync-moved-001', receipt: signReceipt(verified) }, // a real receipt, but for another sighting
      { id: 'bad id!', legacy: claim() },
    ],
  }, NOW);
  assert.deepEqual(out.deleted, ['sync-del-0001']);
  assert.equal((out.rows['sync-ver-0001'] as JournalRow).verified, true);
  assert.equal((out.rows['sync-ver-0001'] as JournalRow).points, row(A, 'sync-ver-0001').points);
  assert.deepEqual((out.rows['sync-ver-0001'] as JournalRow).science, { count: ['1'] });
  assert.equal((out.rows['sync-leg-0001'] as JournalRow).verified, false);
  assert.deepEqual(out.rows['sync-forged-01'], { error: 'nothing to record' });
  assert.deepEqual(out.rows['sync-moved-001'], { error: 'nothing to record' });
  assert.equal(Object.keys(out.rows).length, 4);
  assert.equal(rows.size, 3);
  assert.equal(out.ready, true);
  assert.equal(out.legacyOpen, true);
  assert.ok(out.totals && out.totals.points > 0 && out.totals.speciesCount === 2);
});

test('sync: a receipt for a photo someone else already logged comes back refused, not recorded', async () => {
  const { jdb, rows } = fakeDb();
  const original = sighting({ uid: B });
  await recordSighting(jdb, original);
  const copy = sighting({ uid: A, sid: 'sync-copy-001', sha: original.sha });
  const out = await syncJournal(jdb, A, { items: [{ id: 'sync-copy-001', receipt: signReceipt(copy) }] }, NOW);
  assert.deepEqual(out.rows['sync-copy-001'], { refused: COPY_MESSAGES.copied });
  assert.equal(rows.size, 1);
});

test('recording at identify time does not switch an account or touch its score; its first sync does', async () => {
  const { jdb, profiles } = fakeDb();
  profiles.set(A, { points: 321, species_count: 9 });
  await recordSighting(jdb, sighting());
  assert.equal(await refreshTotals(jdb, A, NOW), null);
  assert.deepEqual(profiles.get(A), { points: 321, species_count: 9 });
  const out = await syncJournal(jdb, A, {}, NOW);
  assert.equal(out.ready, true);
  assert.ok(out.totals!.points >= 321);
});
