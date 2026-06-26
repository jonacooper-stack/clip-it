// Generates Clip-It app icons with no external image tooling — a tiny pure-JS PNG
// encoder + a simple "spotting eye" mark (a lens/eye: observation, not hunting) in
// the brand colors. 2x supersampling gives clean anti-aliased edges.
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

const GREEN = [19, 80, 46]; // #13502E spruce
const RING = [244, 240, 228]; // warm white
const IRIS = [240, 123, 45]; // blaze orange
const HI = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Draw the mark at a supersized resolution, then box-downsample to `size`.
function render(size, { bg, markScale }) {
  const ss = 2;
  const S = size * ss;
  const big = Buffer.alloc(S * S * 4);
  const cx = S / 2, cy = S / 2;
  if (bg) {
    for (let i = 0; i < S * S; i++) {
      big[i * 4] = bg[0]; big[i * 4 + 1] = bg[1]; big[i * 4 + 2] = bg[2]; big[i * 4 + 3] = 255;
    }
  }
  const m = markScale;
  const ringOuter = S * 0.40 * m, ringInner = S * 0.30 * m, iris = S * 0.235 * m, hiR = S * 0.058 * m;
  const hiCx = cx - S * 0.075 * m, hiCy = cy - S * 0.075 * m;
  const blend = (x, y, c) => {
    const i = (y * S + x) * 4;
    big[i] = c[0]; big[i + 1] = c[1]; big[i + 2] = c[2]; big[i + 3] = 255;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= iris) blend(x, y, IRIS);
      if (d <= ringOuter && d >= ringInner) blend(x, y, RING);
      const hd = Math.sqrt((x - hiCx) ** 2 + (y - hiCy) ** 2);
      if (hd <= hiR) blend(x, y, HI);
    }
  }
  // downsample ss×ss → size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = 0; yy < ss; yy++) {
        for (let xx = 0; xx < ss; xx++) {
          const i = ((y * ss + yy) * S + (x * ss + xx)) * 4;
          r += big[i]; g += big[i + 1]; b += big[i + 2]; a += big[i + 3];
        }
      }
      const n = ss * ss, o = (y * size + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

mkdirSync('assets', { recursive: true });
const write = (name, size, opts) => {
  writeFileSync(`assets/${name}`, encodePNG(size, size, render(size, opts)));
  console.log('wrote assets/' + name);
};
write('icon.png', 1024, { bg: GREEN, markScale: 0.92 }); // iOS + base
write('adaptive-icon.png', 1024, { bg: null, markScale: 0.62 }); // Android foreground (safe zone)
write('splash-icon.png', 1024, { bg: null, markScale: 0.5 }); // splash mark on solid bg
write('favicon.png', 48, { bg: GREEN, markScale: 0.92 }); // web
console.log('done');
