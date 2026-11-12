import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signReceipt, verifyReceipt, type ReceiptPayload } from '../api/_lib/receipt';

const UID = '11111111-1111-4111-8111-111111111111';
const now = Date.parse('2026-11-12T12:00:00Z');
const payload = (over: Partial<ReceiptPayload> = {}): ReceiptPayload => ({
  v: 1, uid: UID, sid: 'mhx1abc-9f3k2a', at: now - 5000, observedAt: now - 60_000, loggedAt: now - 6000,
  lat: 44.1, lng: -72.5, accuracyM: 12, capture: 'camera', cameraEvidence: null,
  id: { status: 'ai_confident', common: 'Osprey', sci: 'Pandion haliaetus', group: 'bird', confidence: 0.93, rarity: 0.4, tags: ['in_flight'], dangerous: false, caption: 'An osprey over the lake.' },
  sha: 'ab'.repeat(32), phash: 'f0'.repeat(32), model: 'test-model', ...over,
});

test('a receipt verifies for the account and sighting it was issued to', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
  delete process.env.RECEIPT_SECRET;
  const token = signReceipt(payload())!;
  assert.ok(token && token.split('.').length === 2);
  assert.deepEqual(verifyReceipt(token, UID, 'mhx1abc-9f3k2a', now), payload());
  assert.deepEqual(verifyReceipt(token, UID, undefined, now), payload());
});

test('it cannot be moved to another account or another sighting', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
  const token = signReceipt(payload())!;
  assert.equal(verifyReceipt(token, '22222222-2222-4222-8222-222222222222', undefined, now), null);
  assert.equal(verifyReceipt(token, UID, 'another-sighting', now), null);
});

test('changing anything in it breaks the signature', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
  const token = signReceipt(payload())!;
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify(payload({ id: { ...payload().id, rarity: 1, tags: ['with_young', 'predation'] } })), 'utf8').toString('base64url');
  assert.equal(verifyReceipt(`${forged}.${sig}`, UID, undefined, now), null);
  assert.equal(verifyReceipt(`${body}.${sig.slice(0, -2)}AA`, UID, undefined, now), null);
  assert.equal(verifyReceipt(body, UID, undefined, now), null);
  assert.equal(verifyReceipt(`${body}.${sig}.extra`, UID, undefined, now), null);
  assert.equal(verifyReceipt(42, UID, undefined, now), null);
});

test('a receipt signed with a different key is refused', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
  const token = signReceipt(payload())!;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_other';
  assert.equal(verifyReceipt(token, UID, undefined, now), null);
  process.env.RECEIPT_SECRET = 'own-secret';
  const own = signReceipt(payload())!;
  assert.deepEqual(verifyReceipt(own, UID, undefined, now), payload());
  delete process.env.RECEIPT_SECRET;
  assert.equal(verifyReceipt(own, UID, undefined, now), null);
});

test('while the key is being changed, receipts signed with the previous one are still honoured', () => {
  process.env.RECEIPT_SECRET = 'old-secret';
  const old = signReceipt(payload())!;
  process.env.RECEIPT_SECRET = 'new-secret';
  assert.equal(verifyReceipt(old, UID, undefined, now), null);
  process.env.RECEIPT_SECRET_PREVIOUS = 'old-secret';
  assert.deepEqual(verifyReceipt(old, UID, undefined, now), payload());
  assert.deepEqual(verifyReceipt(signReceipt(payload())!, UID, undefined, now), payload());
  delete process.env.RECEIPT_SECRET;
  delete process.env.RECEIPT_SECRET_PREVIOUS;
});

test('old receipts and ones from the future are refused', () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
  assert.equal(verifyReceipt(signReceipt(payload({ at: now - 91 * 86_400_000 }))!, UID, undefined, now), null);
  assert.equal(verifyReceipt(signReceipt(payload({ at: now + 3600_000 }))!, UID, undefined, now), null);
  assert.ok(verifyReceipt(signReceipt(payload({ at: now - 60 * 86_400_000 }))!, UID, undefined, now));
});

test('without a signing key there are no receipts', () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.RECEIPT_SECRET;
  assert.equal(signReceipt(payload()), null);
  assert.equal(verifyReceipt('a.b', UID, undefined, now), null);
});
