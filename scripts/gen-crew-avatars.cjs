// Regenerate Scout's avatar: node scripts/gen-crew-avatars.cjs (writes PNG + SVG to the cwd;
// copy the PNG to assets/crew and site/img/crew at 256px).
// A playful fox-bot, rendered to PNG with Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const antenna = (x, y, c) => `
  <line x1="${x}" y1="${y}" x2="${x}" y2="${y - 52}" stroke="#2a3430" stroke-width="9" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y - 60}" r="17" fill="${c}"/><circle cx="${x - 5}" cy="${y - 65}" r="6" fill="#fff" opacity=".7"/>`;
const frame = (bg, ring, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><clipPath id="c"><circle cx="256" cy="256" r="238"/></clipPath>
  <radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient></defs>
  <circle cx="256" cy="256" r="254" fill="${ring}"/><circle cx="256" cy="256" r="238" fill="url(#g)"/>
  <g clip-path="url(#c)">${inner}</g></svg>`;
const S = {
scout: frame(['#3a2412', '#1d120a'], '#F4812F', `
  <path d="M110 470 C120 360 170 320 256 320 C342 320 392 360 402 470 Z" fill="#e8742a"/>
  <path d="M196 470 C200 400 226 370 256 370 C286 370 312 400 316 470 Z" fill="#f6e7d4"/>
  <path d="M128 120 L190 215 L150 250 Z" fill="#e8742a"/><path d="M384 120 L322 215 L362 250 Z" fill="#e8742a"/>
  <path d="M146 150 L178 210 L158 228 Z" fill="#3a2412"/><path d="M366 150 L334 210 L354 228 Z" fill="#3a2412"/>
  <path d="M256 190 C330 190 380 230 380 280 C380 320 310 352 256 380 C202 352 132 320 132 280 C132 230 182 190 256 190 Z" fill="#f08a3c"/>
  <path d="M256 300 C300 300 352 300 372 290 C350 330 300 352 256 378 C212 352 162 330 140 290 C160 300 212 300 256 300 Z" fill="#f6e7d4"/>
  ${antenna(300, 205, '#7CA9C6')}
  <rect x="196" y="200" width="120" height="30" rx="15" fill="#2a3430"/><circle cx="256" cy="215" r="20" fill="#fff6cc"/><circle cx="256" cy="215" r="11" fill="#ffd24d"/>
  <ellipse cx="208" cy="268" rx="17" ry="20" fill="#1d120a"/><ellipse cx="304" cy="268" rx="17" ry="20" fill="#1d120a"/>
  <circle cx="214" cy="261" r="6" fill="#fff"/><circle cx="310" cy="261" r="6" fill="#fff"/>
  <ellipse cx="256" cy="322" rx="20" ry="14" fill="#1d120a"/>
  <path d="M236 346 q20 16 40 0" stroke="#1d120a" stroke-width="7" fill="none" stroke-linecap="round"/>`),
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const [k, svg] of Object.entries(S)) {
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`);
    await p.screenshot({ path: `${k}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
    fs.writeFileSync(`${k}.svg`, svg);
  }
  await b.close();
})();
