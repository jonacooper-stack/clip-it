// The copy of a photo kept with a sighting carries no Exif, XMP, IPTC or
// comment blocks (api/_lib/jpegStrip.ts), and the picture itself is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { stripJpegMetadata } from '../api/_lib/jpegStrip';

// A small real JPEG.
function picture(): Buffer {
  const width = 48, height = 32;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([(x * 5) & 255, (y * 7) & 255, ((x + y) * 3) & 255, 255], (y * width + x) * 4);
  return Buffer.from(jpeg.encode({ data, width, height }, 85).data);
}

// One JPEG block: marker, two-byte length (which counts itself), payload.
function block(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

// The same picture, with what a camera or an editor writes into the file.
function withDetails(plain: Buffer): Buffer {
  const exif = block(0xe1, Buffer.from('Exif\0\0MM\0*GPSLatitude 44.123456 Make Apple iPhone', 'latin1'));
  const xmp = block(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>creator</x:xmpmeta>', 'latin1'));
  const iptc = block(0xed, Buffer.from('Photoshop 3.0\0byline: someone', 'latin1'));
  const comment = block(0xfe, Buffer.from('taken at home', 'latin1'));
  return Buffer.concat([plain.subarray(0, 2), exif, xmp, plain.subarray(2, 20), iptc, comment, plain.subarray(20)]);
}

test('camera details, XMP, IPTC and comments are removed; the picture decodes to the same pixels', () => {
  const plain = picture();
  // jpeg-js writes a JFIF header first (18 bytes after the start marker): the extra blocks go in around it
  assert.deepEqual([plain[2], plain[3]], [0xff, 0xe0]);
  const detailed = withDetails(plain);
  assert.ok(detailed.includes(Buffer.from('GPSLatitude')));
  const stripped = stripJpegMetadata(detailed);
  for (const word of ['Exif', 'GPSLatitude', 'xmpmeta', 'Photoshop', 'taken at home']) assert.equal(stripped.includes(Buffer.from(word)), false, word);
  assert.deepEqual(stripped, plain); // exactly the file without the added blocks
  assert.deepEqual(jpeg.decode(stripped, { useTArray: true }).data, jpeg.decode(detailed, { useTArray: true }).data);
});

test('a photo without such blocks comes back unchanged, and stripping twice changes nothing more', () => {
  const plain = picture();
  assert.deepEqual(stripJpegMetadata(plain), plain);
  const once = stripJpegMetadata(withDetails(plain));
  assert.deepEqual(stripJpegMetadata(once), once);
});

test('the colour profile and Adobe colour marker are kept (decoders need them)', () => {
  const plain = picture();
  const icc = block(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01profile-bytes', 'latin1'));
  const adobe = block(0xee, Buffer.from('Adobe\0d\0\0\0\0\x01', 'latin1'));
  const file = Buffer.concat([plain.subarray(0, 2), icc, adobe, block(0xe1, Buffer.from('Exif\0\0x', 'latin1')), plain.subarray(2)]);
  const stripped = stripJpegMetadata(file);
  assert.ok(stripped.includes(Buffer.from('ICC_PROFILE')) && stripped.includes(Buffer.from('Adobe')));
  assert.equal(stripped.includes(Buffer.from('Exif')), false);
});

test('anything that is not a complete JPEG is left exactly as it was', () => {
  const plain = picture();
  for (const odd of [Buffer.alloc(0), Buffer.from('not a jpeg at all'), Buffer.from([0xff, 0xd8]), plain.subarray(0, 12), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), Buffer.alloc(40, 1)])]) {
    assert.deepEqual(stripJpegMetadata(odd), odd);
  }
});
