import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaType, IDENTIFY_SYSTEM, normalizeIdentification, parseModelJson, SCENE_TAG_CODES, stripDataUrl } from '../api/_lib/identifyCore';

const deer = {
  present: true, category: 'wild_animal', commonName: 'White-tailed deer', scientificName: 'Odocoileus virginianus', taxonGroup: 'mammal',
  confidence: 0.93, rarityScore: 0.1, sceneTags: ['with_young'], caption: 'A doe with her fawn.', dangerous: false, needsReview: false, ineligibleReason: '',
};

test('a confident wild animal is scoreable', () => {
  const r = normalizeIdentification(deer);
  assert.equal(r.idStatus, 'ai_confident');
  assert.equal(r.eligible, true);
  assert.equal(r.species.group, 'mammal');
  assert.deepEqual(r.sceneTags, ['with_young']);
  assert.equal(r.rarityScore, 0.1);
});

test('pets and people are identified but never score', () => {
  const dog = normalizeIdentification({ ...deer, category: 'pet', commonName: 'Domestic dog', scientificName: 'Canis lupus familiaris', rarityScore: 0.9, sceneTags: ['group_herd'], ineligibleReason: 'Pets don\'t count.' });
  assert.equal(dog.idStatus, 'ineligible');
  assert.equal(dog.rarityScore, 0); // whatever the model said
  assert.deepEqual(dog.sceneTags, []);
  assert.equal(dog.ineligibleReason, 'Pets don\'t count.');
  const person = normalizeIdentification({ ...deer, category: 'human', commonName: 'Person', scientificName: '' });
  assert.equal(person.idStatus, 'ineligible');
});

test('nothing in frame is rejected', () => {
  assert.equal(normalizeIdentification({ present: false }).idStatus, 'rejected');
  assert.equal(normalizeIdentification({ present: true, commonName: '' }).idStatus, 'rejected'); // "present" with no name
  assert.equal(normalizeIdentification(null).idStatus, 'rejected');
  assert.equal(normalizeIdentification('not an object').idStatus, 'rejected');
});

test('uncertain, dangerous or high-drama sightings are flagged', () => {
  assert.equal(normalizeIdentification({ ...deer, confidence: 0.6 }).idStatus, 'needs_review');
  assert.equal(normalizeIdentification({ ...deer, dangerous: true }).idStatus, 'needs_review');
  assert.equal(normalizeIdentification({ ...deer, sceneTags: ['predation'] }).idStatus, 'needs_review');
  assert.equal(normalizeIdentification({ ...deer, needsReview: true }).idStatus, 'needs_review');
});

test('the model\'s answer is never trusted as-is', () => {
  const r = normalizeIdentification({
    ...deer,
    category: 'dragon', taxonGroup: 'mythical', confidence: 7, rarityScore: -3,
    sceneTags: ['with_young', 'with_young', 'x10_points', 42], caption: 'c'.repeat(900), commonName: `  Deer   ${'x'.repeat(200)}`,
  });
  assert.equal(r.category, 'other'); // unknown category → not a wild animal
  assert.equal(r.eligible, false);
  assert.equal(r.species.group, 'other');
  assert.equal(r.species.confidence, 1);
  assert.equal(r.rarityScore, 0);
  assert.ok(r.caption.length <= 240);
  assert.ok(r.species.commonName.length <= 80);
  const tags = normalizeIdentification({ ...deer, sceneTags: ['with_young', 'with_young', 'x10_points', 42] }).sceneTags;
  assert.deepEqual(tags, ['with_young']); // only tags from the allowed list, once each
  assert.equal(normalizeIdentification({ ...deer, confidence: 'NaN' }).species.confidence, 0);
});

test('JSON is found even when the model wraps it in prose or fences', () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseModelJson('Here you go:\n```json\n{"a":{"b":2}}\n```\nHope that helps!'), { a: { b: 2 } });
  assert.throws(() => parseModelJson('I cannot identify this.'));
  assert.throws(() => parseModelJson('{ broken'));
});

test('the image type comes from the bytes, not the label', () => {
  assert.equal(detectMediaType('/9j/4AAQSkZJRg'), 'image/jpeg');
  assert.equal(detectMediaType('iVBORw0KGgoAAAANS'), 'image/png');
  assert.equal(detectMediaType('UklGRiQAAABXRUJQ'), 'image/webp');
  assert.equal(detectMediaType('R0lGODlhAQABAIAAAP'), 'image/gif');
  assert.equal(detectMediaType('PGh0bWw+'), null); // "<html>"
  assert.equal(stripDataUrl('data:image/png;base64,iVBORw0KGgo'), 'iVBORw0KGgo');
  assert.equal(stripDataUrl('/9j/abc'), '/9j/abc');
});

test('the prompt lists every scene tag the app can score', () => {
  for (const tag of SCENE_TAG_CODES) assert.ok(IDENTIFY_SYSTEM.includes(tag), tag);
});

test('a picture of a picture does not score, and the player is told why', () => {
  for (const [answer, reason] of [
    [{ photoOf: 'screen' }, 'screen'],
    [{ photoOf: 'print' }, 'print'],
    [{ photoOf: 'screenshot' }, 'screenshot'],
    [{ photoOf: 'artwork' }, 'artwork'],
    [{ photoOf: 'scene', watermark: true }, 'watermark'],
    [{ photoOf: 'scene', aiMade: 'yes' }, 'synthetic'],
  ] as const) {
    const r = normalizeIdentification({ ...deer, ...answer });
    assert.equal(r.eligible, false, reason);
    assert.equal(r.idStatus, 'ineligible', reason);
    assert.deepEqual(r.authenticity, { ok: false, reason, review: false });
    assert.equal(r.rarityScore, 0);
    assert.deepEqual(r.sceneTags, []);
    assert.ok(r.ineligibleReason.length > 20 && !/cheat/i.test(r.ineligibleReason), 'a plain reason, not an accusation');
    assert.equal(r.species.commonName, 'White-tailed deer'); // still says what it is
  }
});

test('an ordinary photo scores; doubt alone only marks it for review', () => {
  const plain = normalizeIdentification({ ...deer, photoOf: 'scene', watermark: false, aiMade: 'no' });
  assert.equal(plain.eligible, true);
  assert.deepEqual(plain.authenticity, { ok: true, reason: null, review: false });
  const unsure = normalizeIdentification({ ...deer, photoOf: 'scene', watermark: false, aiMade: 'maybe' });
  assert.equal(unsure.eligible, true);
  assert.deepEqual(unsure.authenticity, { ok: true, reason: null, review: true });
});

test('missing or odd answers about how the picture was made never refuse a photo', () => {
  for (const answer of [{}, { photoOf: 'hologram' }, { watermark: 'yes' }, { aiMade: true }, { photoOf: null, watermark: 1, aiMade: 'probably' }]) {
    const r = normalizeIdentification({ ...deer, ...answer });
    assert.equal(r.eligible, true, JSON.stringify(answer));
    assert.equal(r.authenticity.ok, true);
  }
});

test('a pet on a screen is still just a pet: the model\'s own reason is kept', () => {
  const r = normalizeIdentification({ ...deer, category: 'pet', commonName: 'Domestic dog', ineligibleReason: 'Domestic pets don\'t count.', photoOf: 'screen' });
  assert.equal(r.idStatus, 'ineligible');
  assert.equal(r.ineligibleReason, 'Domestic pets don\'t count.');
});

test('the prompt asks how the picture was made', () => {
  for (const key of ['photoOf', 'watermark', 'aiMade', '"screen"', '"screenshot"', 'trail-camera']) assert.ok(IDENTIFY_SYSTEM.includes(key), key);
});
