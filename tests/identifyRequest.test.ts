// What leaves the phone with a photo (src/lib/identifyRequest.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyRequestBody } from '../src/lib/identifyRequest';

const PHOTO = '/9j/4AAQSkZJRg==';

test('until the journal is being saved to the account, a request is the photo and nothing else', () => {
  assert.deepEqual(identifyRequestBody(PHOTO), { imageBase64: PHOTO, mediaType: 'image/jpeg' });
  // whatever else is known about the sighting, none of it is sent without "which sighting, whose"
  const known = { observedAt: 1_700_000_000_000, loggedAt: 1_700_000_001_000, tz: 'America/Denver', lat: 44.123456, lng: -72.987654, capture: 'library' as const, evidence: { camera: true, screenshot: false, generator: false } };
  assert.deepEqual(identifyRequestBody(PHOTO, known), { imageBase64: PHOTO, mediaType: 'image/jpeg' });
  assert.deepEqual(identifyRequestBody(PHOTO, { ...known, sightingId: 'abc123-xyz' }), { imageBase64: PHOTO, mediaType: 'image/jpeg' });
  assert.deepEqual(identifyRequestBody(PHOTO, { ...known, account: 'user-1' }), { imageBase64: PHOTO, mediaType: 'image/jpeg' });
});

test('when the sighting is being saved: which one, whose, when, how; where only roughly, and only if given', () => {
  const body = identifyRequestBody(PHOTO, {
    sightingId: 'abc123-xyz', account: 'user-1', observedAt: 1_700_000_000_000, loggedAt: 1_700_000_001_000, tz: 'America/Denver', lat: 44.123456, lng: -72.987654,
    capture: 'camera',
  });
  assert.deepEqual(body, {
    imageBase64: PHOTO, mediaType: 'image/jpeg', sightingId: 'abc123-xyz', account: 'user-1', observedAt: 1_700_000_000_000, loggedAt: 1_700_000_001_000,
    tz: 'America/Denver', capture: 'camera', evidence: undefined, lat: 44.12, lng: -72.99,
  });
  // no place given (the player keeps places on the phone): none sent
  const noPlace = identifyRequestBody(PHOTO, { sightingId: 'abc123-xyz', account: 'user-1', observedAt: 1, loggedAt: 2 });
  assert.equal('lat' in noPlace || 'lng' in noPlace, false);
  // nothing in any request names the GPS accuracy
  assert.equal(JSON.stringify(body).includes('accuracy'), false);
});
