// How the journal on the device and the cloud journal are brought together
// (src/lib/journalMerge.ts). The thing these tests guard above all: nothing
// leaves the device unless the player deleted it or the cloud says it was
// deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCloudRow, applyPushAnswer, applyPushAnswers, belongsInCloud, forgetCloudCopies, fromCloudRow, mergeCloud, mergeRows, needsPush, prefsToSend, pushItem,
  takePrefs, worthReidentifying, type CloudRow,
} from '../src/lib/journalMerge';
import type { Sighting } from '../src/types';

const NOW = Date.parse('2026-11-12T15:00:00Z');
const score = (total: number) => ({ basePoints: 6, behaviorMultiplier: 1, repeatMultiplier: 1, bonuses: { firstOfSpecies: 5, quest: 0, streak: 0, fieldNotes: 0 }, totalPoints: total, ruleVersion: 'scoring-v1' });
const local = (id: string, over: Partial<Sighting> = {}): Sighting => ({
  id, createdAt: NOW - 5000, observedAt: NOW - 6000, sceneTags: [], idStatus: 'ai_confident', points: 11, score: score(11), source: 'ai',
  species: { scientificName: 'Pandion haliaetus', commonName: 'Osprey', confidence: 0.9, group: 'bird' }, photoUri: `photos/${id}.jpg`, ...over,
});
const cloud = (id: string, over: Partial<CloudRow> = {}): CloudRow => ({
  id, observed_at: new Date(NOW - 6000).toISOString(), logged_at: new Date(NOW - 5000).toISOString(), deleted_at: null, lat: 44.1, lng: -72.5,
  status: 'ai_confident', common_name: 'Osprey', scientific_name: 'Pandion haliaetus', taxon_group: 'bird', confidence: 0.9, scene_tags: ['in_flight'], caption: 'An osprey.',
  dangerous: false, points: 14, score: score(14), verified: true, capture: 'camera', has_photo: true, science: null, proposed_species: null, wall_post_id: null, ...over,
});
const groupOf = (s: Sighting) => s.species?.group;

test('only sightings that count go to the cloud; demo results and pets never do', () => {
  assert.equal(belongsInCloud(local('a')), true);
  assert.equal(belongsInCloud(local('a', { idStatus: 'disputed' })), true);
  for (const idStatus of ['identifying', 'queued', 'ineligible', 'rejected'] as const) assert.equal(belongsInCloud(local('a', { idStatus })), false, idStatus);
  assert.equal(belongsInCloud(local('a', { source: 'mock' })), false);
  assert.equal(belongsInCloud(local('a', { species: undefined })), false);
  assert.equal(belongsInCloud(local('a', { cloudSkip: true })), false);
});

test('a sighting is sent when the cloud has never seen it, or the player changed it since', () => {
  assert.equal(needsPush(local('a')), true);
  assert.equal(needsPush(local('a', { cloudAt: NOW })), false);
  assert.equal(needsPush(local('a', { cloudAt: NOW, rev: 2, sentRev: 2 })), false);
  assert.equal(needsPush(local('a', { cloudAt: NOW, rev: 3, sentRev: 2 })), true);
  assert.equal(needsPush(local('a', { cloudAt: NOW, rev: 1 })), true);
});

test('what is sent: the receipt when there is one, the phone\'s own record for an older sighting, only the edits once it is in the cloud', () => {
  const withReceipt = pushItem(local('a', { receipt: 'body.sig', science: { count: ['2'] } }), groupOf);
  assert.deepEqual(withReceipt, { id: 'a', science: { count: ['2'] }, wallPostId: null, receipt: 'body.sig' });
  const legacy = pushItem(local('b', { lat: 1, lng: 2, caption: 'hi', capture: 'library' }), groupOf, { places: true }) as any;
  assert.equal(legacy.receipt, undefined);
  assert.deepEqual([legacy.legacy.sci, legacy.legacy.common, legacy.legacy.group, legacy.legacy.points, legacy.legacy.status, legacy.legacy.lat, legacy.legacy.capture], ['Pandion haliaetus', 'Osprey', 'bird', 11, 'ai_confident', 1, 'library']);
  const edits = pushItem(local('c', { cloudAt: NOW - 10, rev: 1, proposedSpecies: 'Bald eagle', wallPostId: 'p1', receipt: 'stale' }), groupOf);
  assert.deepEqual(edits, { id: 'c', science: {}, proposedSpecies: 'Bald eagle', wallPostId: 'p1' });
  // field notes saved by an old version as a single string are sent as a list
  const old = pushItem(local('d', { science: { count: '2', empty: '', ok: ['a'] } as any }), groupOf) as any;
  assert.deepEqual(old.science, { count: ['2'], ok: ['a'] });
});

test('the server\'s score replaces the phone\'s; the player\'s unsent changes are never overwritten', () => {
  const synced = applyCloudRow(local('a', { cloudAt: NOW - 100 }), cloud('a', { points: 14, science: { count: ['1'] } }), NOW);
  assert.deepEqual([synced.points, synced.verified, synced.cloudPhoto, synced.cloudAt, synced.science], [14, true, true, NOW, { count: ['1'] }]);
  assert.equal(synced.photoUri, 'photos/a.jpg'); // the device keeps its own photo and anything else the cloud doesn't hold

  const edited = local('a', { cloudAt: NOW - 100, rev: 2, sentRev: 1, science: { count: ['3'] }, points: 12 });
  const kept = applyCloudRow(edited, cloud('a', { points: 11, science: null }), NOW);
  assert.deepEqual([kept.science, kept.points, kept.cloudAt, needsPush(kept)], [{ count: ['3'] }, 12, NOW - 100, true]); // still waiting to be sent
});

test('a sighting the phone scored before scores moved to the server keeps the points the player has always seen', () => {
  const legacy = applyCloudRow(local('a', { points: 11 }), cloud('a', { verified: false, points: 0, score: null }), NOW);
  assert.deepEqual([legacy.points, legacy.score?.totalPoints, legacy.verified, legacy.cloudAt], [11, 11, false, NOW]);
  const verified = applyCloudRow(local('a', { points: 11 }), cloud('a', { verified: true, points: 3 }), NOW);
  assert.equal(verified.points, 3); // one the server identified is the server's to score
});

test('a capture this phone never finished identifying is completed from the cloud, not identified again', () => {
  const stuck: Sighting = { id: 'a', createdAt: NOW - 9000, observedAt: NOW - 9000, sceneTags: [], idStatus: 'identifying', photoUri: 'photos/a.jpg' };
  const done = applyCloudRow(stuck, cloud('a'), NOW);
  assert.deepEqual([done.idStatus, done.species?.commonName, done.points, done.sceneTags, done.verified, done.photoUri], ['ai_confident', 'Osprey', 14, ['in_flight'], true, 'photos/a.jpg']);
  const queued = applyCloudRow({ ...stuck, idStatus: 'queued', retry: { attempts: 2, nextAt: NOW + 1000 } }, cloud('a'), NOW);
  assert.deepEqual([queued.idStatus, queued.retry], ['ai_confident', undefined]);
});

test('statuses: "needs review" shows as identified; a suggested species shows as disputed', () => {
  assert.equal(applyCloudRow(local('a', { cloudAt: 1 }), cloud('a', { status: 'needs_review' }), NOW).idStatus, 'ai_confident');
  const disputed = applyCloudRow(local('a', { cloudAt: 1 }), cloud('a', { status: 'disputed', proposed_species: 'Bald eagle' }), NOW);
  assert.deepEqual([disputed.idStatus, disputed.proposedSpecies], ['disputed', 'Bald eagle']);
});

test('a sighting that exists only in the cloud appears on the device (a new phone)', () => {
  const s = fromCloudRow(cloud('z', { science: { count: ['1'] }, wall_post_id: 'post-1' }), NOW);
  assert.deepEqual(
    [s.id, s.species?.scientificName, s.species?.group, s.points, s.lat, s.lng, s.verified, s.cloudAt, s.cloudPhoto, s.photoUri, s.source, s.wallPostId],
    ['z', 'Pandion haliaetus', 'bird', 14, 44.1, -72.5, true, NOW, true, 'cloud:z', 'ai', 'post-1'],
  );
  assert.equal(needsPush(s), false);
});

test('merging what the cloud has: adds what is missing, removes only what the cloud says was deleted', () => {
  const mine = [local('new-local', { createdAt: NOW }), local('both', { cloudAt: NOW - 100, createdAt: NOW - 10 }), local('gone-elsewhere', { cloudAt: NOW - 100, createdAt: NOW - 20 }), local('cloud-silent', { cloudAt: NOW - 100, createdAt: NOW - 30 })];
  const rows = [cloud('both', { points: 20 }), cloud('gone-elsewhere', { deleted_at: new Date(NOW).toISOString(), scientific_name: 'Pandion haliaetus', common_name: null, status: null }), cloud('only-cloud', { logged_at: new Date(NOW - 15).toISOString() })];
  const out = mergeRows(mine, [], rows, NOW);
  assert.deepEqual(out.sightings.map((s) => s.id), ['new-local', 'both', 'only-cloud', 'cloud-silent']); // newest first
  assert.deepEqual([out.added, out.removed], [1, 1]);
  assert.equal(out.sightings.find((s) => s.id === 'both')!.points, 20);
  // The one the cloud didn't mention is untouched, and so is the one not yet uploaded.
  assert.deepEqual(out.sightings.find((s) => s.id === 'cloud-silent'), mine[3]);
  assert.deepEqual(out.sightings.find((s) => s.id === 'new-local'), mine[0]);
});

test('an empty answer from the cloud removes nothing', () => {
  const mine = [local('a', { cloudAt: 1 }), local('b')];
  assert.deepEqual(mergeRows(mine, ['x'], [], NOW), { sightings: mine, pendingDeletes: ['x'], added: 0, removed: 0 });
});

test('a sighting deleted here is not brought back by the cloud before the server has been told', () => {
  const out = mergeRows([local('keep')], ['deleted-here', 'deleted-both'], [cloud('deleted-here'), cloud('deleted-both', { deleted_at: new Date(NOW).toISOString() })], NOW);
  assert.deepEqual(out.sightings.map((s) => s.id), ['keep']);
  assert.deepEqual(out.pendingDeletes, ['deleted-here']); // the server already knows about the other
});

test('the server\'s answer to an upload', () => {
  const sent = local('a', { receipt: 'body.sig', rev: 1, sentRev: 1 });
  const ok = applyPushAnswer(sent, cloud('a', { points: 14 }), NOW)!;
  assert.deepEqual([ok.points, ok.cloudAt, ok.receipt, ok.verified], [14, NOW, undefined, true]);
  assert.equal(needsPush(ok), false);

  const refused = applyPushAnswer(sent, { refused: 'This photo has already been logged by another explorer.' }, NOW)!;
  assert.deepEqual([refused.idStatus, refused.points, refused.ineligibleReason, needsPush(refused)], ['ineligible', undefined, 'This photo has already been logged by another explorer.', false]);

  const invalid = applyPushAnswer(sent, { error: 'a sighting needs a species name' }, NOW)!;
  assert.deepEqual([invalid.idStatus, invalid.points, needsPush(invalid)], ['ai_confident', 11, false]); // kept as it was, not sent again

  assert.equal(applyPushAnswer(sent, cloud('a', { deleted_at: new Date(NOW).toISOString() }), NOW), null);
});

test('a change made while a sync was in the air is not lost: it is still waiting afterwards', () => {
  // Sent with one field note (rev 1); the player ticked a second before the answer came back (rev 2).
  const now = [local('a', { rev: 2, science: { count: ['1'], behavior: ['feeding'] }, points: 13 }), local('b', { rev: 1, science: { count: ['2'] }, points: 12 })];
  const out = applyPushAnswers(now, { a: cloud('a', { science: { count: ['1'] }, points: 12 }), b: cloud('b', { science: { count: ['2'] }, points: 12 }) }, new Map([['a', 1], ['b', 1]]), NOW);
  const [a, b] = out;
  assert.deepEqual([a.science, a.points, a.sentRev, needsPush(a), a.cloudAt], [{ count: ['1'], behavior: ['feeding'] }, 13, 1, true, NOW]);
  assert.deepEqual([b.science, b.sentRev, needsPush(b)], [{ count: ['2'] }, 1, false]);
  // a sighting that wasn't part of the request is left exactly as it is
  const other = local('c');
  assert.deepEqual(applyPushAnswers([other], { c: cloud('c') }, new Map(), NOW), [other]);
});

test('where a sighting was taken leaves the phone only if the player saves places, and then only roughly', () => {
  const s = local('a', { lat: 44.123456, lng: -72.987654, accuracyM: 8 });
  // saving places: two decimals (about a kilometre), never the exact spot, never the GPS accuracy
  const withPlaces = (pushItem(s, groupOf, { places: true }) as any).legacy;
  assert.deepEqual([withPlaces.lat, withPlaces.lng, 'accuracyM' in withPlaces], [44.12, -72.99, false]);
  // not saving places (also when the choice hasn't been made): nothing about where
  for (const opts of [{ places: false }, {}, undefined]) {
    const without = (pushItem(s, groupOf, opts) as any).legacy;
    assert.equal('lat' in without || 'lng' in without || 'accuracyM' in without, false);
  }
  // the journal on the phone keeps the exact spot
  assert.deepEqual([s.lat, s.lng], [44.123456, -72.987654]);
  // a sighting restored from the account shows the rough place it was saved with
  assert.deepEqual([fromCloudRow(cloud('z', { lat: 44.12, lng: -72.99 }), NOW).lat, fromCloudRow(cloud('z', { lat: null, lng: null }), NOW).lat], [44.12, undefined]);
  // and syncing never replaces the phone's exact spot with the rough one
  assert.deepEqual([applyCloudRow(s, cloud('a', { lat: 44.12, lng: -72.99 }), NOW).lat, applyCloudRow(s, cloud('a', { lat: null, lng: null }), NOW).lat], [44.123456, 44.123456]);
});

test('a phone-scored sighting the server counts for nothing is offered to the server to identify itself', () => {
  const uploaded = applyCloudRow(local('a', { points: 11 }), cloud('a', { verified: false, points: 0, score: null }), NOW);
  assert.deepEqual([uploaded.points, uploaded.cloudPoints, worthReidentifying(uploaded)], [11, 0, true]);
  // one the server already counts, one it identified itself, and one not uploaded yet are left alone
  assert.equal(worthReidentifying(applyCloudRow(local('b', { points: 11 }), cloud('b', { verified: false, points: 11 }), NOW)), false);
  assert.equal(worthReidentifying(applyCloudRow(local('c'), cloud('c', { verified: true, points: 0 }), NOW)), false);
  assert.equal(worthReidentifying(local('d')), false);
});

test('a sync answer never wipes the player\'s choices (backup on or off, places on the phone)', () => {
  const chosen = mergeCloud(null, { backup: true, places: false });
  assert.deepEqual(chosen, { ready: false, totals: null, backup: true, places: false });
  const afterSync = mergeCloud(chosen, { ready: true, totals: { points: 40, speciesCount: 3 } });
  assert.deepEqual(afterSync, { ready: true, totals: { points: 40, speciesCount: 3 }, backup: true, places: false });
  const afterPull = mergeCloud(afterSync, { pulledAt: '2026-11-12T15:00:00Z' });
  assert.deepEqual([afterPull.backup, afterPull.places, afterPull.ready, afterPull.pulledAt], [true, false, true, '2026-11-12T15:00:00Z']);
  assert.equal(mergeCloud(mergeCloud(null, { backup: false }), { totals: null }).backup, false); // "Not now" stays "Not now"
});

// ---------- the player's choices belong to the account ----------
test('a choice made on this device is sent until the account has it', () => {
  assert.equal(prefsToSend(null), null);
  assert.equal(prefsToSend(mergeCloud(null, {})), null); // not answered here: nothing to say
  assert.deepEqual(prefsToSend(mergeCloud(null, { backup: true, places: true })), { backup: 'yes', places: true });
  assert.deepEqual(prefsToSend(mergeCloud(null, { backup: true })), { backup: 'yes', places: false }); // places not chosen counts as off
  assert.deepEqual(prefsToSend(mergeCloud(null, { backup: false })), { backup: 'no' });
  // the account already has it
  assert.equal(prefsToSend(mergeCloud(null, { backup: true, places: false, saved: { backup: 'yes', places: false } })), null);
  assert.equal(prefsToSend(mergeCloud(null, { backup: false, saved: { backup: 'no', places: false } })), null);
  // only what differs is sent
  assert.deepEqual(prefsToSend(mergeCloud(null, { backup: true, places: true, saved: { backup: 'yes', places: false } })), { places: true });
  assert.deepEqual(prefsToSend(mergeCloud(null, { backup: false, saved: { backup: 'yes', places: true } })), { backup: 'no' });
});

test('the account\'s answer is followed on every device; one that has not answered is never taken as a yes', () => {
  // a new device: the account says yes, with places off
  const fresh = takePrefs(null, { backup: 'yes', places: false, epoch: null });
  assert.deepEqual([fresh.backup, fresh.places, prefsToSend(fresh)], [true, false, null]);
  // the account says no (turned off on another device): this device stops too
  const stopped = takePrefs(mergeCloud(null, { backup: true, places: true, saved: { backup: 'yes', places: true } }), { backup: 'no', places: false, epoch: null });
  assert.deepEqual([stopped.backup, stopped.places], [false, false]);
  // the account has never answered: this device has no answer either (so the player is asked)…
  assert.equal(takePrefs(null, { backup: null, places: false, epoch: null }).backup, undefined);
  // …and an answer just given here stands, and is still to be sent
  const answered = takePrefs(mergeCloud(null, { backup: true, places: true }), { backup: null, places: false, epoch: null });
  assert.deepEqual([answered.backup, answered.places, prefsToSend(answered)], [true, true, { backup: 'yes', places: true }]);
  // a choice changed here while a request was in the air is not overwritten by that request's answer
  const before = { backup: true, places: true };
  const toggled = mergeCloud(mergeCloud(null, { ...before, saved: { backup: 'yes', places: true } }), { places: false });
  const afterAnswer = takePrefs(toggled, { backup: 'yes', places: true, epoch: null }, before);
  assert.deepEqual([afterAnswer.places, prefsToSend(afterAnswer)], [false, { places: false }]);
  // the same answer with nothing changed here is simply taken
  assert.equal(takePrefs(mergeCloud(null, { ...before, saved: { backup: 'yes', places: true } }), { backup: 'yes', places: false, epoch: null }, before).places, false);
});

test('after the saved journal is erased, sightings are no longer taken to be in the account', () => {
  const journal = [
    local('a', { cloudAt: NOW - 10, cloudPhoto: true, cloudPoints: 11, verified: true, rev: 2, sentRev: 2 }),
    local('b', { cloudAt: NOW - 10, photoUri: 'cloud:b', cloudPhoto: true }), // its photo existed only in the account
    local('c', { cloudSkip: true }),
    local('d'), // never sent
  ];
  const after = forgetCloudCopies(journal);
  assert.equal(after.length, 4); // nothing leaves the phone
  assert.deepEqual(after.map((s) => [s.cloudAt, s.cloudPhoto, s.cloudPoints, s.cloudSkip]), [[undefined, undefined, undefined, undefined], [undefined, undefined, undefined, undefined], [undefined, undefined, undefined, undefined], [undefined, undefined, undefined, undefined]]);
  assert.deepEqual(after.map((s) => s.photoUri), ['photos/a.jpg', undefined, 'photos/c.jpg', 'photos/d.jpg']);
  assert.deepEqual(after.map((s) => s.points), [11, 11, 11, 11]); // the journal on the phone keeps its points
  // if the backup is turned on again they all go up afresh, with the player's notes
  assert.deepEqual(after.map(needsPush), [true, true, true, true]);
  assert.equal(after[3], journal[3]); // untouched ones are not copied
});
