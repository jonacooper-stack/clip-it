// Removes from a JPEG the blocks that describe the photo rather than draw it:
// Exif (camera, time, GPS position), XMP, IPTC and comments. The picture
// itself is untouched. The app's own photos never carry these (resizing
// drops them); this makes sure a copy kept on the server doesn't either,
// whatever sent it.
//
// Kept: JFIF (APP0), the colour profile (APP2) and Adobe's colour marker
// (APP14), which decoders need to show the colours right.
export function stripJpegMetadata(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Buffer[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes; // not where a block should start: leave the file as it is
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // padding between blocks
      continue;
    }
    if (marker === 0xda) {
      kept.push(bytes.subarray(i)); // start of the picture data: the rest is the picture
      return Buffer.concat(kept);
    }
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > bytes.length) return bytes;
    const describes = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!describes) kept.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return bytes; // no picture data found: not a complete JPEG, leave it alone
}
