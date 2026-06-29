// Generates ClipIt's app icons: a bear framed like a wildlife photo — a green
// gradient ground, a blaze-orange picture frame, and a cream bear inside.
//
// The art is vector (SVG) and rasterized to PNG with headless Chrome, so the
// committed PNGs in assets/ are the source of truth for builds; this script just
// regenerates them. Run: CHROME_BIN=/path/to/chrome node scripts/gen-icons.mjs
// (Chrome has a minimum viewport, so every target renders at >=512px.)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ASSETS = new URL('../assets/', import.meta.url).pathname;

// Frame + bear, centered in a 1024 viewBox. `scale` shrinks it toward center
// (Android adaptive icons must keep content inside the central safe zone).
const art = (scale = 1) => `
  <g transform="translate(512,512) scale(${scale}) translate(-512,-512)">
    <rect x="176" y="176" width="672" height="672" rx="108" fill="url(#frame)"/>
    <rect x="210" y="210" width="604" height="604" rx="84" fill="none" stroke="#00000022" stroke-width="6"/>
    <rect x="240" y="240" width="544" height="544" rx="64" fill="#0E1712"/>
    <g clip-path="url(#photo)">
      <circle cx="380" cy="900" r="250" fill="#16291C"/>
      <circle cx="700" cy="940" r="270" fill="#13241A"/>
    </g>
    <g fill="#F3ECDB">
      <circle cx="420" cy="430" r="68"/><circle cx="604" cy="430" r="68"/>
      <ellipse cx="512" cy="546" rx="176" ry="168"/>
    </g>
    <circle cx="420" cy="430" r="31" fill="#0E1712"/><circle cx="604" cy="430" r="31" fill="#0E1712"/>
    <ellipse cx="512" cy="612" rx="104" ry="84" fill="#E4D6BC"/>
    <circle cx="450" cy="522" r="17" fill="#15110C"/><circle cx="574" cy="522" r="17" fill="#15110C"/>
    <ellipse cx="512" cy="578" rx="35" ry="25" fill="#15110C"/>
    <path d="M512 601 v27" stroke="#15110C" stroke-width="11" stroke-linecap="round"/>
  </g>`;

const svg = ({ bg = true, scale = 1 } = {}) => `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3CB266"/><stop offset="1" stop-color="#0F3D23"/></linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F79A4E"/><stop offset="1" stop-color="#E8731F"/></linearGradient>
    <clipPath id="photo"><rect x="240" y="240" width="544" height="544" rx="64"/></clipPath>
  </defs>
  ${bg ? '<rect width="1024" height="1024" fill="url(#bg)"/>' : ''}
  ${art(scale)}
</svg>`;

// Center the SVG and overscan it past the viewport so the canvas is always fully
// covered — otherwise a sub-pixel viewport shortfall leaves a white strip at the
// edge (which reads as an off-center icon on the home screen). The art sits well
// inside the safe zone, so the few cropped background pixels are invisible. Opaque
// icons also get a solid background matching the gradient's base as a final guard.
const page = (inner, bg = 'transparent') =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:${bg}}svg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:104vw;height:104vh}</style></head><body>${inner}</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'clipit-icons-'));
// [output, markup, size, transparent]
const targets = [
  ['icon.png', svg({ bg: true }), 1024, false],
  ['favicon.png', svg({ bg: true }), 512, false],
  ['splash-icon.png', svg({ bg: false }), 512, true],
  ['adaptive-icon.png', svg({ bg: false, scale: 0.85 }), 1024, true],
];

for (const [out, markup, size, transparent] of targets) {
  const html = join(dir, out + '.html');
  const png = join(dir, out);
  writeFileSync(html, page(markup, transparent ? 'transparent' : '#0F3D23'));
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', `--window-size=${size},${size}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${png}`, `file://${html}`,
  ], { stdio: 'ignore' });
  copyFileSync(png, join(ASSETS, out));
  console.log(`wrote assets/${out} (${size}px${transparent ? ', transparent' : ''})`);
}
