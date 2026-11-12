// How the journal on the device and the cloud journal are brought together
// (src/lib/journalMerge.ts). The thing these tests guard above all: nothing
// leaves the device unless the player deleted it or the cloud says it was
// deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCloudRow, applyPushAnswer, applyPushAnswers, belongsInCloud, fromCloudRow, mergeRows, needsPush, pushItem, type CloudRow } from '../src/lib/journalMerge';
import type { Sighting } from '../src/types';

const NOW = Date.parse('2026-11-12T15:00:00Z');
const score = (total: number) => ({ basePoints: 6, behaviorMultiplier: 1, repeatMultiplier: 1, bonuses: { firstOfSpecies: 5, quest: 0, streak: 0, fieldNotes: 0 }, totalPoints: total, ruleVersion: 'scoring-v1' });
const local = (id: string, over: Partial<Sighting> = {}): Sighting => ({
  id, createdAt: NOW - 5000, observedAt: NOW - 6000, sceneTags: [], idStatus: 'ai_confident', points: 11, score: score(11), source: 'ai',
  species: { scientificName: 'Pandion haliaetus', commonName: 'Osprey', confidence: 0.9, group: 'bird' }, photoUri: `photos/${id}.jpg`, ...over,
});
const cloud = (id: string, over: Partial<CloudRow> = {}): CloudRow => ({
  id, observed_at: new Date(NOW - 6000).toISOString(), logged_at: new Date(NOW - 5000).toISOString(), deleted_at: null, lat: 44.1, lng: -72.5, accuracy_m: 10,
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
  const legacy = pushItem(local('b', { lat: 1, lng: 2, caption: 'hi', capture: 'library' }), groupOf) as any;
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
