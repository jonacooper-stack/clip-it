// A sighting's place as it leaves the phone: two decimals (shared/place.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approxPlace, roundPlace } from '../shared/place';

test('a place is kept to two decimals of a degree', () => {
  assert.deepEqual(approxPlace(44.123456, -72.987654), { lat: 44.12, lng: -72.99 });
  assert.deepEqual(approxPlace(51.50074, -0.12462), { lat: 51.5, lng: -0.12 });
  assert.deepEqual(approxPlace(-33.8688, 151.2093), { lat: -33.87, lng: 151.21 });
  assert.equal(roundPlace(0.004), 0);
  assert.equal(JSON.stringify(approxPlace(-0.001, -0.004)), '{"lat":0,"lng":0}'); // no "-0" in what is sent
});

test('the rounded place is at most about 700 m from the real one, and never more precise', () => {
  for (const [lat, lng] of [[44.123456, -72.987654], [0.005, 0.005], [-89.994, 179.994], [61.2181, -149.9003]]) {
    const p = approxPlace(lat, lng)!;
    assert.ok(Math.abs(p.lat - lat) <= 0.005 + 1e-9 && Math.abs(p.lng - lng) <= 0.005 + 1e-9);
    assert.equal(p.lat, Number(p.lat.toFixed(2)));
    assert.equal(p.lng, Number(p.lng.toFixed(2)));
  }
});

test('what is not a real position has no place', () => {
  for (const [lat, lng] of [[91, 0], [0, 181], [NaN, 1], [Infinity, 1], ['44.1', 2], [null, null], [undefined, 3]] as [unknown, unknown][]) {
    assert.equal(approxPlace(lat, lng), null);
  }
});
