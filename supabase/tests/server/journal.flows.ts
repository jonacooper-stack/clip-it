// The server's journal code, run against a real Postgres.
//
// tests/journal.test.ts checks the rules against an in-memory stand-in for the
// database. This file checks the other half: that the real code (the rules in
// api/_lib/journal.ts, through the real adapter in api/_lib/journalDb.ts, and
// the nightly upkeep) works against the real tables, constraints, grants,
// triggers and SQL functions of the migrations. It then reads the journal the
// way the app does, as the signed-in player. A column the code names that the
// table doesn't have, a value a constraint refuses, a function called with
// the wrong arguments: this is where it shows.
//
// Run by `npm run test:db` (supabase/tests/run.sh), which gives it a fresh
// database with every migration applied.
import './env';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { createClient } from './pgSupabase';
import * as journal from '../../../api/_lib/journal';
import { supabaseJournalDb } from '../../../api/_lib/journalDb';
import * as upkeep from '../../../api/_lib/journalUpkeep';
import * as server from '../../../api/_lib/server';
import { compare, mirrorPrint, photoFingerprint, samePhoto } from '../../../api/_lib/phash';
import { signReceipt } from '../../../api/_lib/receipt';
import { LIBRARY_PRINTS } from '../../../api/_lib/libraryHashes';
import { CLOUD_COLUMNS } from '../../../src/lib/journalMerge';

const REPO = join(__dirname, '..', '..', '..');
const NOW = Date.now();
const DAY = 86_400_000;

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail !== undefined ? `\n     ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}

async function main() {
  // (Host, user and password come from the usual PG* variables, as for psql.)
  const pool = new pg.Pool({ database: process.env.CLIPIT_SERVER_TEST_DB ?? 'clipit_server_test', max: 8 });
  const sql = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;

  // Accounts: N is created after the migration (a new player); E existed before it (baseline 420, allowance 500).
  const N = '11111111-1111-4111-8111-111111111111';
  const M = '22222222-2222-4222-8222-222222222222';
  const E = '00000000-0000-4000-8000-0000000000e0';
  await sql(`insert into auth.users (id) values ($1), ($2) on conflict do nothing`, [N, M]);
  const users = { exists: async (uid: string) => (await sql('select 1 from auth.users where id = $1', [uid])).length > 0 };

  const svc = createClient(pool, { role: 'service_role' }, users);
  const jdb = supabaseJournalDb(svc);
  const asUser = (uid: string) => createClient(pool, { role: 'authenticated', sub: uid });

  // Photos to play with: drawn here (soft shapes at random places, so each has
  // plenty of detail and no two look alike), not taken from Scout's library.
  const small = (buf: Buffer, quality: number) => {
    // a re-save at another quality (what a share-and-save round trip does)
    const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
    return Buffer.from(jpeg.encode(img, quality).data);
  };
  const drawn = (seed: number): Buffer => {
    let state = (seed * 2654435761) >>> 0;
    const rnd = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    const width = 640, height = 480;
    const data = Buffer.alloc(width * height * 4, 255);
    const shade = new Float64Array(width * height).fill(110 + rnd() * 40);
    for (let k = 0; k < 60; k++) {
      const cx = rnd() * width, cy = rnd() * height, rx = 25 + rnd() * 110, ry = 25 + rnd() * 110, v = (rnd() - 0.5) * 150;
      for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(height, cy + ry); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(width, cx + rx); x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d < 1) shade[y * width + x] += v * (1 - d);
        }
      }
    }
    for (let i = 0; i < width * height; i++) {
      const g = Math.max(0, Math.min(255, shade[i] + (rnd() - 0.5) * 8));
      data[i * 4] = g;
      data[i * 4 + 1] = Math.max(0, Math.min(255, g * 0.95 + 8));
      data[i * 4 + 2] = Math.max(0, Math.min(255, g * 0.85));
    }
    return Buffer.from(jpeg.encode({ data, width, height }, 75).data);
  };
  const picked: { bytes: Buffer; print: any }[] = [];
  for (let seed = 1; picked.length < 8 && seed < 60; seed++) {
    const bytes = drawn(seed);
    const print = photoFingerprint(bytes.toString('base64'));
    if (!print.phash || compare(print, print)!.shared < 120) continue; // enough detail to compare
    const different = (other: any) => !samePhoto({ phash: print.phash, mask: print.mask }, other);
    if (picked.every((q) => different(q.print)) && Object.values(LIBRARY_PRINTS).every(different)) picked.push({ bytes, print });
  }
  if (picked.length < 8) throw new Error(`only ${picked.length} usable test photos`);
  const [fox, owl, heron, coyote, bighorn, pronghorn, spare1, spare2] = picked.map((q) => q.bytes);
  const foxResaved = small(fox, 45);
  const photo = (slug: string) => readFileSync(join(REPO, 'site', 'img', 'library', `${slug}.jpg`)); // one of Scout's library photos, for the library check
  const b64 = (b: Buffer) => b.toString('base64');
  const fp = (b: Buffer) => photoFingerprint(b64(b));
  const nosha = (b: Buffer) => ({ phash: fp(b).phash, mask: fp(b).mask });
  check('test photos fingerprint: the re-saved copy is the same picture, another photo is not', Boolean(fp(fox).phash) && samePhoto(nosha(fox), nosha(foxResaved)) && !samePhoto(nosha(fox), nosha(owl)), {
    resaved: compare(fp(fox), fp(foxResaved)),
    other: compare(fp(fox), fp(owl)),
  });

  let n = 0;
  const payload = (uid: string, bytes: Buffer, over: any = {}) => {
    const { id, ...rest } = over;
    const print = fp(bytes);
    return {
      v: 1, uid, sid: `sight-${++n}-${uid.slice(0, 4)}`, at: NOW, observedAt: NOW - 3600_000, loggedAt: NOW - 3000_000, lat: 44.1234, lng: -72.5678,
      capture: 'camera', cameraEvidence: null,
      id: { status: 'ai_confident', common: 'Red fox', sci: 'Vulpes vulpes', group: 'mammal', confidence: 0.93, rarity: 0.5, tags: ['in_flight'], dangerous: false, caption: 'A fox crossing a field.', ...id },
      sha: print.sha, phash: print.phash, mask: print.mask, model: 'claude-test', ...rest,
    };
  };
  const locked = <T>(uid: string, fn: () => Promise<T>) => journal.withJournalLock(jdb, uid, 8000, fn);

  // ---------- 0. nothing is stored until the account says yes ----------
  const early = payload(N, fox);
  let first: any = await locked(N, () => journal.syncJournal(jdb, N, { tz: 'America/New_York', items: [{ id: early.sid, receipt: signReceipt(early) }] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  check('choice: an account that has not answered has nothing stored, not even its time zone', first.prefs?.backup === null && Object.keys(first.rows ?? { x: 1 }).length === 0
    && (await sql('select 1 from public.journal_sightings where user_id = $1', [N])).length === 0 && (await sql('select tz from public.journal_state where user_id = $1', [N]))[0]?.tz == null, first);
  const asPlayer = createClient(pool, { role: 'authenticated', sub: N });
  const choiceRead = await asPlayer.from('journal_state').select('backup, save_places, erased_at').eq('user_id', N).maybeSingle();
  check('choice: the app can read the account\'s (unanswered) choice', !choiceRead.error && choiceRead.data && choiceRead.data.backup === null, choiceRead);
  first = await locked(N, () => journal.syncJournal(jdb, N, { prefs: { backup: 'yes', places: true } }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  check('choice: saying yes (with places) is recorded on the account', first.prefs?.backup === 'yes' && first.prefs.places === true && first.prefs.epoch === null, first);
  for (const uid of [M, E]) await locked(uid, () => journal.syncJournal(jdb, uid, { prefs: { backup: 'yes', places: true } }, { fingerprint: photoFingerprint }));
  // (the first sync above switched N to server-kept scores; undo that so the checks below see a fresh account)
  await sql('update public.journal_state set ready_at = null, tz = null where user_id = any($1::uuid[])', [[N, M, E]]);
  await sql('delete from public.profiles where id = $1', [N]);
  await sql('delete from public.journal_photo_cleanup');

  // ---------- 1. a new account records a sighting the server identified ----------
  const p1 = payload(N, fox);
  let out: any;
  try {
    out = await locked(N, () => journal.recordSighting(jdb, p1, b64(fox), { places: true }));
  } catch (err: any) {
    out = { kind: 'threw', message: String(err?.message ?? err) };
  }
  check('record: a verified sighting is written', out.kind === 'recorded' && out.created === true, out);
  const stored = await jdb.getRow(N, p1.sid).catch((e: any) => ({ error: String(e?.message ?? e) }));
  check('record: the row reads back with the right types', stored && stored.points === 14 && stored.verified === true && Array.isArray(stored.scene_tags) && stored.scene_tags[0] === 'in_flight'
    && typeof stored.score === 'object' && stored.score.basePoints === 6 && stored.lat === 44.12 && stored.lng === -72.57 && stored.has_photo === true && stored.photo_phash === p1.phash
    && Date.parse(stored.observed_at) === p1.observedAt && !('accuracy_m' in stored), stored);
  check('record: the photo copy is stored under the account folder', (await sql(`select 1 from storage.objects where bucket_id = 'journal-photos' and name = $1`, [`${N}/${p1.sid}.jpg`])).length === 1);

  // Totals: the account only counts once it has synced (ready_at). identify.ts calls refreshTotals after recording.
  const before = await journal.refreshTotals(jdb, N);
  check('totals: nothing is written before the first sync', before === null, before);
  let sync: any = await locked(N, () => journal.syncJournal(jdb, N, { tz: 'America/New_York', items: [] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  check('sync: first sync of a new account succeeds and reports totals', sync && sync.ready === true && sync.totals && sync.totals.points >= 14 && sync.totals.speciesCount === 1 && sync.legacyOpen === true, sync);
  const stateN = (await sql('select tz, ready_at, baseline_points, carryover_points, legacy_allowance from public.journal_state where user_id = $1', [N]))[0];
  check('sync: the state row has the time zone and the switch time; a new account has no allowance', stateN && stateN.tz === 'America/New_York' && stateN.ready_at && stateN.legacy_allowance === 0 && stateN.baseline_points === 0, stateN);
  const profN = (await sql('select display_name, points, species_count from public.profiles where id = $1', [N]))[0];
  check('totals: a profile row is created for an account without one, with the server score', profN && profN.points === sync.totals?.points && profN.species_count === 1 && profN.display_name === 'Explorer', profN);

  // ---------- 2. the same species again; a retry; a dangerous animal ----------
  const p2 = payload(N, owl, { id: { common: 'Red fox', sci: 'Vulpes vulpes' } });
  out = await locked(N, () => journal.recordSighting(jdb, p2, null));
  check('record: a second sighting of the species is worth less', out.kind === 'recorded' && out.row.points === 5, out.row?.points); // round(6/2 × 1.5) = 5 (4.5 rounds up)
  out = await locked(N, () => journal.recordSighting(jdb, { ...p2, id: { ...p2.id, rarity: 1 } }, null));
  check('record: recording it again changes nothing', out.kind === 'recorded' && out.created === false && out.row.points === 5, out);

  // ---------- 3. copies ----------
  const copy = payload(M, foxResaved, { id: { common: 'Red fox', sci: 'Vulpes vulpes' } });
  out = await locked(M, () => journal.recordSighting(jdb, copy, b64(foxResaved)));
  check('copies: another account handing in a re-saved copy is refused', out.kind === 'refused' && out.reason === 'copied', out);
  const refusals = await sql('select user_id, sighting_id, reason, matched_user, matched_ref from public.journal_refusals where user_id = $1', [M]);
  check('copies: the refusal is on record with what it matched', refusals.length === 1 && refusals[0].reason === 'copied' && refusals[0].matched_user === N && refusals[0].matched_ref === `journal:${p1.sid}`, refusals);
  const mirrored = payload(M, fox, {});
  Object.assign(mirrored, mirrorPrint(mirrored));
  mirrored.sha = createHash('sha256').update('mirrored').digest('hex');
  out = await locked(M, () => journal.recordSighting(jdb, mirrored, null));
  check('copies: a mirrored copy is refused too', out.kind === 'refused' && out.reason === 'copied', out);
  // the player's own photo, re-saved and uploaded again from the camera roll: recorded, worth nothing
  const own = payload(N, foxResaved, { capture: 'library', cameraEvidence: true });
  out = await locked(N, () => journal.recordSighting(jdb, own, null));
  check('copies: the player\'s own photo uploaded again is recorded, worth nothing', out.kind === 'recorded' && out.row.points === 0, out.row);
  // the next frame of a burst with the ClipIt camera looks the same and is a different photo: it scores as a repeat
  const burst = payload(N, small(fox, 80), { capture: 'camera' });
  out = await locked(N, () => journal.recordSighting(jdb, burst, null));
  check('copies: a burst frame from the ClipIt camera scores as a repeat sighting', out.kind === 'recorded' && out.row.points > 0, out.row);
  const libraryShot = payload(M, small(photo('fox-drink'), 60), {});
  out = await locked(M, () => journal.recordSighting(jdb, libraryShot, null));
  check('copies: one of Scout\'s library photos is refused', out.kind === 'refused' && out.reason === 'library', out);
  const different = payload(M, heron, { id: { common: 'Great blue heron', sci: 'Ardea herodias', group: 'bird' } });
  out = await locked(M, () => journal.recordSighting(jdb, different, b64(heron)));
  check('copies: a different photo is recorded', out.kind === 'recorded' && out.created, out);

  // ---------- 4. two requests at once for one account ----------
  const c1 = payload(N, coyote, { id: { common: 'Coyote', sci: 'Canis latrans' } });
  const c2 = payload(N, bighorn, { id: { common: 'Coyote', sci: 'Canis latrans' } });
  const both = await Promise.all([locked(N, () => journal.recordSighting(jdb, c1, null)), locked(N, () => journal.recordSighting(jdb, c2, null))]);
  const firsts = both.filter((o: any) => o.kind === 'recorded' && o.row.score.bonuses.firstOfSpecies > 0).length;
  check('lock: two sightings of a new species recorded at once: only one is "first of its species"', firsts === 1, both.map((o: any) => o.row?.score));
  check('lock: the lock is released afterwards', (await sql('select busy_until from public.journal_state where user_id = $1', [N]))[0].busy_until === null);

  // ---------- 5. the phone's old journal (an account from before the change) ----------
  const legacy = (i: number, over: any = {}) => ({
    id: `legacy-${i}-abcdef`,
    legacy: { observedAt: NOW - 20 * DAY, loggedAt: NOW - 20 * DAY, lat: 44.0049, lng: -72.0051, status: 'ai_confident', common: 'Red fox', sci: 'Vulpes vulpes', group: 'mammal', confidence: 0.9, tags: ['in_flight', 'made_up'], caption: 'A fox at dusk.', points: 12, capture: 'camera', ...over },
  });
  sync = await locked(E, () => journal.syncJournal(jdb, E, { tz: 'Europe/Paris', items: [legacy(1), legacy(2, { sci: 'Ardea herodias', common: 'Great blue heron', group: 'bird', points: 30 }), { ...legacy(3, { points: 9 }), photoBase64: b64(owl) }] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  const rowsE = await sql('select id, points, claimed_points, verified, score, photo_sha, photo_phash, has_photo, scene_tags, status, lat, lng from public.journal_sightings where user_id = $1 order by id', [E]);
  check('legacy: places arrive rounded to two decimals', rowsE.length === 3 && rowsE.every((r: any) => r.lat === 44 && r.lng === -72.01), rowsE.map((r: any) => [r.lat, r.lng]));
  check('legacy: the phone\'s sightings are stored as unverified, with their claimed points', sync.rows && Object.keys(sync.rows).length === 3 && rowsE.length === 3 && rowsE.every((r: any) => r.verified === false && r.score === null && r.photo_phash === null)
    && rowsE.map((r: any) => r.points).join() === '12,30,9' && rowsE[2].has_photo === true && rowsE[0].scene_tags.join() === 'in_flight', { sync, rowsE });
  check('legacy: the answer hides the server\'s own notes', sync.rows && Object.values(sync.rows).every((r: any) => !('photo_sha' in r) && !('claimed_points' in r) && !('flags' in r) && !('model' in r)), sync.rows);
  const profE = (await sql('select points, species_count from public.profiles where id = $1', [E]))[0];
  const stateE = (await sql('select tz, ready_at, baseline_points, carryover_points, legacy_allowance from public.journal_state where user_id = $1', [E]))[0];
  // 12 + 30 + 9 = 51 sighting points (+ any quest rewards), plus what is left of the 420 baseline once those are counted.
  check('legacy: the score does not drop at the switch (baseline carried over, shrinking as sightings arrive)', profE && sync.totals && profE.points === sync.totals.points && profE.points >= 420 && stateE.carryover_points <= 420 - 51 && stateE.carryover_points >= 0 && stateE.tz === 'Europe/Paris', { profE, stateE, totals: sync.totals });

  // ---------- 6. the player's own additions, and the wall ----------
  const userN = asUser(N);
  const post = await userN.from('feed_posts').insert({ user_id: N, sighting_id: p1.sid, common_name: 'Tiger', scientific_name: 'Panthera tigris', points: 400, caption: 'Look!' }).select('id, points, common_name, scientific_name');
  check('wall: a post that shares a sighting takes its points and species from the journal', !post.error && post.data?.[0]?.points === 14 && post.data[0].common_name === 'Red fox', post);
  const postId = post.data?.[0]?.id;
  const storedCode = (await sql('select sighting_id from public.feed_posts where id = $1', [postId]))[0]?.sighting_id;
  const mine = await userN.rpc('my_wall_post', { p_sighting: p1.sid });
  const theirs = await asUser(M).rpc('my_wall_post', { p_sighting: p1.sid });
  check('wall: the post carries a one-way code, and only the poster can ask which post shares a sighting', /^[0-9a-f]{64}$/.test(storedCode ?? '') && storedCode !== p1.sid && mine.data === postId && theirs.data == null, { storedCode, mine, theirs });
  sync = await locked(N, () => journal.syncJournal(jdb, N, { tz: 'America/New_York', items: [{ id: p1.sid, science: { count: ['1'], habitat: ['forest'], nonsense: ['x'] }, proposedSpecies: 'Gray fox', wallPostId: postId }] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  const edited = (await sql('select points, science, proposed_species, status, wall_post_id, score from public.journal_sightings where user_id = $1 and id = $2', [N, p1.sid]))[0];
  check('edits: field notes add their bonus, a suggested species marks it disputed, the wall post is linked', edited && edited.points > 14 && edited.science && edited.science.count && !edited.science.nonsense && edited.proposed_species === 'Gray fox' && edited.status === 'disputed' && edited.wall_post_id === postId, { edited, sync });
  const postNow = (await sql('select points, common_name from public.feed_posts where id = $1', [postId]))[0];
  check('edits: the wall post shows the sighting\'s new points', postNow && postNow.points === edited.points, { postNow, edited: edited?.points });

  // ---------- 7. the app reads its journal (as the signed-in player) ----------
  const pulled = await userN.from('journal_sightings').select(CLOUD_COLUMNS).order('updated_at', { ascending: true }).order('id', { ascending: true }).range(0, 199);
  check('app read: the player can read exactly the columns the app asks for', !pulled.error && pulled.data.length >= 4 && pulled.data.every((r: any) => r.id && !('photo_sha' in r)), pulled.error ?? pulled.data?.length);
  const newest = pulled.data?.[pulled.data.length - 1]?.updated_at;
  const again = await userN.from('journal_sightings').select(CLOUD_COLUMNS).order('updated_at', { ascending: true }).order('id', { ascending: true }).gte('updated_at', newest).range(0, 199);
  check('app read: "changed since" with the timestamp the server returned finds the newest row again', !again.error && again.data.length >= 1 && again.data.some((r: any) => r.updated_at === newest), { newest, got: again.data?.map((r: any) => r.updated_at) });
  const star = await userN.from('journal_sightings').select('*');
  check('app read: the server\'s own notes cannot be read by the player', Boolean(star.error) && star.error.code === '42501', star.error ?? 'no error');
  const others = await asUser(M).from('journal_sightings').select(CLOUD_COLUMNS).eq('user_id', N);
  check('app read: another player sees none of it', !others.error && others.data.length === 0, others);
  const write = await userN.from('journal_sightings').update({ points: 500 }).eq('id', p1.sid);
  check('app write: a player cannot change their own rows', Boolean(write.error), write);
  const stateRead = await userN.from('journal_state').select('tz, ready_at, baseline_points, carryover_points, legacy_allowance');
  check('app read: the player can read their own state', !stateRead.error && stateRead.data.length === 1, stateRead);
  const scoreWrite = await userN.from('profiles').update({ points: 99999, species_count: 999 }).eq('id', N).select('points, species_count');
  check('app write: the app\'s own score is ignored once the server keeps it', !scoreWrite.error && scoreWrite.data?.[0]?.points !== 99999, scoreWrite);

  // ---------- 8. deleting ----------
  sync = await locked(N, () => journal.syncJournal(jdb, N, { deletes: [p2.sid, 'never-seen-123456'] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  const tomb = (await sql('select deleted_at, observed_at, common_name, scientific_name, points, photo_phash, lat, scene_tags, taxon_group, capture, model from public.journal_sightings where user_id = $1 and id = $2', [N, p2.sid]))[0];
  const marker = (await sql('select deleted_at, points from public.journal_sightings where user_id = $1 and id = $2', [N, 'never-seen-123456']))[0];
  check('delete: the row becomes an emptied marker that keeps the species and fingerprint', sync.deleted?.length === 2 && tomb && tomb.deleted_at && tomb.common_name === null && tomb.scientific_name === 'Vulpes vulpes' && tomb.points === 0 && tomb.photo_phash && tomb.lat === null
    && tomb.taxon_group === null && tomb.capture === null && tomb.model === null && Math.abs(new Date(tomb.observed_at).getTime() - new Date(tomb.deleted_at).getTime()) < 5, { sync, tomb });
  check('delete: a sighting the server never saw gets a marker', marker && marker.deleted_at && marker.points === 0, marker);
  sync = await locked(N, () => journal.syncJournal(jdb, N, { deletes: [p1.sid] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  check('delete: the stored photo goes with the sighting', (await sql(`select 1 from storage.objects where bucket_id = 'journal-photos' and name = $1`, [`${N}/${p1.sid}.jpg`])).length === 0);
  const late = await locked(N, () => journal.recordSighting(jdb, payload(N, owl, { sid: 'never-seen-123456' }), null));
  check('delete: a sighting cancelled before it arrived is not recorded after all', late.kind === 'recorded' && late.created === false && Boolean(late.row.deleted_at), late);

  // ---------- 9. receipts through sync (the identify endpoint could not record at the time) ----------
  const viaReceipt = payload(M, pronghorn, { id: { common: 'Pronghorn', sci: 'Antilocapra americana' } });
  const token = signReceipt(viaReceipt);
  sync = await locked(M, () => journal.syncJournal(jdb, M, { tz: 'UTC', items: [{ id: viaReceipt.sid, receipt: token }] }, { fingerprint: photoFingerprint })).catch((e: any) => ({ threw: String(e?.message ?? e) }));
  check('receipt: a sighting arrives later with its signed receipt and is scored by the server', sync.rows?.[viaReceipt.sid]?.verified === true && sync.rows[viaReceipt.sid].points > 0, sync);

  // ---------- 10. daily counters ----------
  const used0 = await server.usedToday(svc, N, 'score');
  const reached = await server.dailyLimitReached(svc, N, 'score');
  const used1 = await server.usedToday(svc, N, 'score');
  check('counters: bump_usage and the read-back work for the new kinds', used0 === 0 && reached === false && used1 === 1, { used0, reached, used1 });

  // ---------- 11. the nightly upkeep ----------
  const started = await upkeep.startLegacyClock(svc);
  const until = await jdb.legacyUntil();
  check('upkeep: the legacy clock starts once, 30 days out, and reads back as a time', started === true && (await upkeep.startLegacyClock(svc)) === false, { started });
  // (legacyUntil caches for a minute per instance; a fresh adapter reads the stored value.)
  const untilFresh = await supabaseJournalDb(svc).legacyUntil();
  check('upkeep: the stored end date parses', typeof untilFresh === 'number' || typeof until === 'number' || until === null, { until, untilFresh });
  const stored2 = (await sql(`select value, jsonb_typeof(value) as t from public.app_settings where key = 'legacy_import_until'`))[0];
  check('upkeep: the end date is stored as a JSON string the database rule can read', stored2 && stored2.t === 'string' && (await sql('select private.legacy_open() as open'))[0].open === true, stored2);
  check('upkeep: settling scores does nothing while the window is open', (await upkeep.settleLegacyScores(svc)) === 0);

  // wall fingerprints: a post with a photo in our own storage
  const photoUrl = `https://example.supabase.co/storage/v1/object/public/feed-photos/${M}/wall-1.jpg`;
  await sql('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing', [M, 'Em']);
  const wallPost = (await sql('insert into public.feed_posts (user_id, common_name, photo_url) values ($1, $2, $3) returning id', [M, 'Barred owl', photoUrl]))[0];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => (String(url) === photoUrl ? new Response(owl, { status: 200 }) : new Response('', { status: 404 }))) as any;
  const printed = await upkeep.printWallPhotos(svc, { deadline: Date.now() + 10_000 });
  globalThis.fetch = realFetch;
  const prints = await sql('select post_id, user_id, photo_sha, photo_phash from public.wall_prints where post_id = $1', [wallPost.id]);
  check('upkeep: new wall photos are fingerprinted', printed >= 1 && prints.length === 1 && prints[0].photo_phash === fp(owl).phash, { printed, prints });
  const fromWall = payload(N, small(owl, 50), { id: { common: 'Barred owl', sci: 'Strix varia', group: 'bird' } });
  out = await locked(N, () => journal.recordSighting(jdb, fromWall, null));
  check('upkeep: a photo taken from the wall is then refused for another account', out.kind === 'refused' && out.reason === 'copied', out);

  // a deleted account's stored photos
  const G = '33333333-3333-4333-8333-333333333333';
  await sql('insert into auth.users (id) values ($1)', [G]);
  await sql('insert into public.profiles (id, display_name) values ($1, $2)', [G, 'Gone']);
  await sql(`insert into storage.objects (bucket_id, name) values ('journal-photos', $1), ('journal-photos', $2)`, [`${G}/sight-g-1.jpg`, `${G}/sight-g-2.jpg`]);
  await sql('delete from auth.users where id = $1', [G]); // cascades to the profile, which queues the cleanup
  const queued = await sql('select user_id from public.journal_photo_cleanup');
  const cleared = await upkeep.clearDeletedAccounts(svc, { deadline: Date.now() + 10_000 });
  check('upkeep: a deleted account\'s stored photos are removed', queued.length === 1 && cleared === 1 && (await sql(`select 1 from storage.objects where name like $1`, [`${G}/%`])).length === 0 && (await sql('select 1 from public.journal_photo_cleanup')).length === 0, { queued, cleared });

  // purge (the app asks for it just before deleting the account)
  await locked(M, () => journal.syncJournal(jdb, M, { purge: true }));
  check('purge: an account\'s stored photos are removed on request', (await sql(`select 1 from storage.objects where bucket_id = 'journal-photos' and name like $1`, [`${M}/%`])).length === 0);

  // ---------- 11b. places off, turning the backup off, erasing ----------
  const placed = (await sql('select count(*)::int as n from public.journal_sightings where user_id = $1 and lat is not null', [E]))[0].n;
  sync = await locked(E, () => journal.syncJournal(jdb, E, { prefs: { places: false } }, { fingerprint: photoFingerprint }));
  check('places: switching them off forgets the places already saved', placed > 0 && sync.prefs.places === false && (await sql('select count(*)::int as n from public.journal_sightings where user_id = $1 and lat is not null', [E]))[0].n === 0, { placed, prefs: sync.prefs });
  const leftover = payload(E, spare1, { sid: 'left-over-photo-1' });
  await locked(E, () => journal.recordSighting(jdb, leftover, b64(spare1)));
  // a deletion whose photo removal did not get through: the marker goes on saying it has a photo, and the nightly job finishes it
  await sql(`update public.journal_sightings set deleted_at = now() where user_id = $1 and id = $2`, [E, leftover.sid]);
  const retried = await upkeep.retryDeletedPhotos(svc, { deadline: Date.now() + 5000 });
  check('upkeep: a deleted sighting\'s leftover photo is removed on a later run', retried === 1 && (await sql(`select 1 from storage.objects where name = $1`, [`${E}/${leftover.sid}.jpg`])).length === 0
    && (await sql('select has_photo from public.journal_sightings where user_id = $1 and id = $2', [E, leftover.sid]))[0].has_photo === false, { retried });
  await sql(`insert into public.journal_refusals (user_id, sighting_id, reason, created_at) values ($1, 'old-note-1', 'copied', now() - interval '91 days'), ($1, 'new-note-1', 'copied', now() - interval '89 days')`, [E]);
  await upkeep.expireRefusalNotes(svc);
  check('upkeep: notes about refused photos go after 90 days', (await sql(`select sighting_id from public.journal_refusals where user_id = $1 order by 1`, [E])).map((r: any) => r.sighting_id).join() === 'new-note-1');
  sync = await locked(E, () => journal.syncJournal(jdb, E, { prefs: { backup: 'no' } }, { fingerprint: photoFingerprint }));
  const afterOff = payload(E, spare2, { id: { common: 'Pronghorn', sci: 'Antilocapra americana' } });
  const offOut = await locked(E, () => journal.syncJournal(jdb, E, { items: [{ id: afterOff.sid, receipt: signReceipt(afterOff) }] }, { fingerprint: photoFingerprint }));
  check('choice: after turning the backup off nothing new is stored', sync.prefs.backup === 'no' && Object.keys(offOut.rows).length === 0 && (await sql('select 1 from public.journal_sightings where user_id = $1 and id = $2', [E, afterOff.sid])).length === 0, offOut);
  const rowsBefore = (await sql('select count(*)::int as n from public.journal_sightings where user_id = $1', [E]))[0].n;
  sync = await locked(E, () => journal.syncJournal(jdb, E, { erase: true }, { fingerprint: photoFingerprint }));
  const stE = (await sql('select tz, backup, save_places, erased_at, ready_at from public.journal_state where user_id = $1', [E]))[0];
  check('erase: everything saved to the account\'s journal is gone (rows, notes, photos, time zone)', rowsBefore > 0
    && (await sql('select 1 from public.journal_sightings where user_id = $1', [E])).length === 0 && (await sql('select 1 from public.journal_refusals where user_id = $1', [E])).length === 0
    && (await sql(`select 1 from storage.objects where bucket_id = 'journal-photos' and name like $1`, [`${E}/%`])).length === 0
    && stE.tz === null && stE.backup === 'no' && stE.erased_at && sync.prefs.epoch && sync.prefs.backup === 'no', { rowsBefore, stE, prefs: sync.prefs });
  const profAfter = (await sql('select points, species_count from public.profiles where id = $1', [E]))[0];
  check('erase: the score goes with the journal (the leaderboard shows 0)', profAfter && profAfter.points === 0 && profAfter.species_count === 0, profAfter);

  // ---------- 12. what the adapter logged as errors along the way ----------
  const unexpected = (svc.log as string[]).filter((l) => !/23505/.test(l));
  check('no unexpected database errors from the server\'s requests', unexpected.length === 0, unexpected);

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.log(`FAIL the server checks crashed: ${String(err?.stack ?? err).slice(0, 600)}`);
  process.exit(2);
});
