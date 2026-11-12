import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exifFromJpeg, importLooksGenuine, photoEvidence } from '../shared/photoEvidence';

test('a phone photo (iOS picker: one flat object with camera and exposure fields) has camera evidence', () => {
  const ios = { Make: 'Apple', Model: 'iPhone 15', LensModel: 'iPhone 15 back dual wide camera 5.96mm f/1.6', ExposureTime: 0.0083, FNumber: 1.6, ISOSpeedRatings: [64], DateTimeOriginal: '2026:11:02 08:14:33', Software: '18.1', GPSLatitude: 44.1 };
  assert.deepEqual(photoEvidence(ios), { camera: true, screenshot: false, generator: false });
  assert.equal(importLooksGenuine(photoEvidence(ios)), true);
});

test('an Android photo (ExifInterface tag names, values as strings) has camera evidence', () => {
  const android = { Make: 'Google', Model: 'Pixel 8', ExposureTime: '0.004', FNumber: '1.7', ISOSpeedRatings: '52', DateTimeOriginal: '2026:11:02 08:14:33', ImageWidth: 4080 };
  assert.equal(photoEvidence(android).camera, true);
});

test('nested details ({Exif} / {TIFF}, as the photo library returns them) are found too', () => {
  assert.equal(photoEvidence({ '{TIFF}': { Make: 'Canon', Model: 'EOS R7' }, '{Exif}': { ExposureTime: 0.001, FNumber: 6.3 } }).camera, true);
  assert.equal(photoEvidence({ '{Exif}': { ExposureTime: 0.001, FNumber: 6.3 } }).camera, true); // no make, but real exposure settings
});

test('a picture saved from the web has no camera evidence', () => {
  assert.equal(photoEvidence(null).camera, false);
  assert.equal(photoEvidence({}).camera, false);
  assert.equal(photoEvidence({ PixelXDimension: 1200, PixelYDimension: 800, ColorSpace: 1, Orientation: 1 }).camera, false);
  assert.equal(photoEvidence({ Make: '', Model: '  ' }).camera, false);
  assert.equal(photoEvidence({ ExposureTime: 0, FNumber: 0 }).camera, false); // empty placeholders
  assert.equal(importLooksGenuine(photoEvidence({ PixelXDimension: 1200 })), false);
});

test('screenshots are recognised', () => {
  assert.equal(photoEvidence({ UserComment: 'Screenshot', PixelXDimension: 1179 }).screenshot, true);
  assert.equal(photoEvidence({ Make: 'Apple' }, { subtypes: ['screenshot'] }).screenshot, true);
  assert.equal(importLooksGenuine(photoEvidence({ Make: 'Apple' }, { subtypes: ['screenshot'] })), false);
  assert.equal(photoEvidence({ UserComment: 'my screenshot folder' }).screenshot, false);
});

test('details that name an image generator are recognised', () => {
  for (const software of ['Midjourney v6', 'DALL·E 3', 'Adobe Firefly', 'Stable Diffusion XL', 'Made with Google AI']) {
    assert.equal(photoEvidence({ Software: software }).generator, true, software);
  }
  assert.equal(photoEvidence({ Make: 'Canon', Software: 'Adobe Lightroom 7.4' }).generator, false); // editing a real photo is fine
  assert.equal(importLooksGenuine(photoEvidence({ Make: 'Canon', Software: 'Midjourney' })), false);
});

test('unknown evidence (an app build that does not send it) is allowed, as before', () => {
  assert.equal(importLooksGenuine(null), true);
  assert.equal(importLooksGenuine(undefined), true);
});

// A minimal JPEG carrying camera details, built by hand: SOI, an APP1 "Exif"
// block (Make + Model in the first directory, ExposureTime + FNumber in the
// Exif directory), then the start of image data.
function jpegWithExif(little: boolean): Uint8Array {
  const tiff: number[] = [];
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  const make = ascii('Canon');
  const model = ascii('Canon EOS R7');
  // Layout: header(8) | IFD0: count(2) + 3 entries(36) + next(4) = 42 → ends at 50
  const makeAt = 50;
  const modelAt = makeAt + make.length;
  const exifAt = modelAt + model.length;
  // Exif IFD: count(2) + 2 entries(24) + next(4) = 30 → rationals after it
  const expAt = exifAt + 30;
  const fnumAt = expAt + 8;
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(3));
  tiff.push(...u16(0x010f), ...u16(2), ...u32(make.length), ...u32(makeAt));
  tiff.push(...u16(0x0110), ...u16(2), ...u32(model.length), ...u32(modelAt));
  tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifAt));
  tiff.push(...u32(0));
  tiff.push(...make, ...model);
  tiff.push(...u16(2));
  tiff.push(...u16(0x829a), ...u16(5), ...u32(1), ...u32(expAt));
  tiff.push(...u16(0x829d), ...u16(5), ...u32(1), ...u32(fnumAt));
  tiff.push(...u32(0));
  tiff.push(...u32(1), ...u32(500)); // 1/500 s
  tiff.push(...u32(63), ...u32(10)); // f/6.3
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...app1, 0xff, 0xda, 0, 2]);
}

test('camera details are read straight from a JPEG file (for web uploads)', () => {
  for (const little of [true, false]) {
    const exif = exifFromJpeg(jpegWithExif(little));
    assert.deepEqual(exif, { Make: 'Canon', Model: 'Canon EOS R7', ExposureTime: 1 / 500, FNumber: 6.3 });
    assert.equal(photoEvidence(exif).camera, true);
  }
});

test('a JPEG without details, a truncated file and a non-JPEG all give null (no crash)', () => {
  assert.equal(exifFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), null);
  assert.equal(exifFromJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(exifFromJpeg(new Uint8Array([])), null);
  const full = jpegWithExif(true);
  for (let cut = 3; cut < full.length; cut += 7) exifFromJpeg(full.subarray(0, cut)); // must not throw
});
