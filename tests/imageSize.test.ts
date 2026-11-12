import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_MAX_DIM, imageTokens, resizeFor } from '../src/lib/imageSize';

test('the longest side is capped, whichever way the photo is turned', () => {
  assert.deepEqual(resizeFor({ width: 4032, height: 3024 }, 1280), { width: 1280 }); // landscape
  assert.deepEqual(resizeFor({ width: 3024, height: 4032 }, 1280), { height: 1280 }); // portrait
  assert.deepEqual(resizeFor({ width: 2000, height: 2000 }, 1280), { width: 1280 }); // square
});

test('small photos are never upscaled', () => {
  assert.equal(resizeFor({ width: 800, height: 600 }, 1280), null);
  assert.equal(resizeFor({ width: 1280, height: 720 }, 1280), null);
});

test('an unknown size falls back to capping the width', () => {
  assert.deepEqual(resizeFor(null, 1280), { width: 1280 });
  assert.deepEqual(resizeFor({ width: 0, height: 0 }, 1280), { width: 1280 });
});

test('a portrait phone photo now costs the same as a landscape one', () => {
  // Before: width capped at 1280 → a 3:4 portrait went out at 1280×1707.
  const before = imageTokens({ width: 1280, height: 1707 });
  const after = imageTokens({ width: 960, height: 1280 });
  assert.equal(after, imageTokens({ width: 1280, height: 960 }));
  assert.ok(after / before < 0.6, `${after} vs ${before}`);
  assert.equal(AI_MAX_DIM, 1280);
});
