// Regenerate the Field Crew avatars: node scripts/gen-crew-avatars.cjs (writes PNG + SVG to the cwd;
// copy the PNGs to assets/crew and site/img/crew at 256px).
// Playful animal-bot avatars for the Field Crew, rendered to PNG with Chromium.
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
hoot: frame(['#24394a', '#122029'], '#7CA9C6', `
  <path d="M120 470 C110 300 160 190 256 190 C352 190 402 300 392 470 Z" fill="#5d7f96"/>
  <path d="M175 470 C175 360 205 300 256 300 C307 300 337 360 337 470 Z" fill="#c9dbe6"/>
  <path d="M190 330 l14 18 l14 -18 M238 330 l14 18 l14 -18 M286 330 l14 18 l14 -18 M214 372 l14 18 l14 -18 M262 372 l14 18 l14 -18" stroke="#8fb0c4" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M150 215 L168 140 L215 200 Z" fill="#5d7f96"/><path d="M362 215 L344 140 L297 200 Z" fill="#5d7f96"/>
  ${antenna(256, 196, '#F4812F')}
  <circle cx="200" cy="252" r="56" fill="#fff"/><circle cx="312" cy="252" r="56" fill="#fff"/>
  <circle cx="200" cy="252" r="56" fill="none" stroke="#2a3430" stroke-width="11"/><circle cx="312" cy="252" r="56" fill="none" stroke="#2a3430" stroke-width="11"/>
  <path d="M256 245 q0 -14 0 0" stroke="#2a3430" stroke-width="11"/><line x1="250" y1="246" x2="262" y2="246" stroke="#2a3430" stroke-width="11"/>
  <circle cx="208" cy="258" r="27" fill="#1b2a33"/><circle cx="304" cy="258" r="27" fill="#1b2a33"/>
  <circle cx="217" cy="248" r="9" fill="#fff"/><circle cx="313" cy="248" r="9" fill="#fff"/>
  <path d="M238 300 L274 300 L256 330 Z" fill="#F4A13A"/>
  <circle cx="160" cy="304" r="12" fill="#f29bb0" opacity=".55"/><circle cx="352" cy="304" r="12" fill="#f29bb0" opacity=".55"/>`),
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
moss: frame(['#173a25', '#0b1f13'], '#35A65F', `
  <path d="M70 470 C70 330 150 270 256 270 C362 270 442 330 442 470 Z" fill="#7a5a34"/>
  <path d="M100 470 C104 350 170 300 256 300 C342 300 408 350 412 470 Z" fill="#9c7444"/>
  <g fill="#b88d55" stroke="#7a5a34" stroke-width="8">
    <polygon points="256,330 296,353 296,399 256,422 216,399 216,353"/>
    <polygon points="176,377 216,400 216,446 176,469 136,446 136,400"/><polygon points="336,377 376,400 376,446 336,469 296,446 296,400"/>
  </g>
  <g fill="#d9dfe0"><circle cx="256" cy="345" r="5"/><circle cx="256" cy="407" r="5"/><circle cx="176" cy="392" r="5"/><circle cx="336" cy="392" r="5"/></g>
  <path d="M190 290 C190 200 220 160 256 160 C292 160 322 200 322 290 Z" fill="#7cc48e"/>
  <ellipse cx="256" cy="215" rx="62" ry="58" fill="#8dd39e"/>
  ${antenna(256, 160, '#E6B23C')}
  <circle cx="230" cy="210" r="13" fill="#0b1f13"/><circle cx="282" cy="210" r="13" fill="#0b1f13"/>
  <circle cx="234" cy="205" r="5" fill="#fff"/><circle cx="286" cy="205" r="5" fill="#fff"/>
  <path d="M232 240 q24 20 48 0" stroke="#0b1f13" stroke-width="7" fill="none" stroke-linecap="round"/>
  <circle cx="212" cy="234" r="9" fill="#f29bb0" opacity=".5"/><circle cx="300" cy="234" r="9" fill="#f29bb0" opacity=".5"/>`),
magpie: frame(['#2e2a14', '#16140a'], '#E6B23C', `
  <path d="M120 470 C120 330 170 250 256 250 C342 250 392 330 392 470 Z" fill="#1b1f24"/>
  <path d="M120 470 C130 380 160 340 196 330 C190 400 200 440 214 470 Z" fill="#2c5f8a"/>
  <path d="M392 470 C382 380 352 340 316 330 C322 400 312 440 298 470 Z" fill="#2c5f8a"/>
  <path d="M206 470 C206 390 226 350 256 350 C286 350 306 390 306 470 Z" fill="#f2f2ee"/>
  <ellipse cx="256" cy="240" rx="98" ry="92" fill="#1b1f24"/>
  ${antenna(256, 152, '#7CA9C6')}
  <path d="M300 300 L360 286 L300 268 Z" fill="#2a3430"/>
  <circle cx="226" cy="232" r="15" fill="#fff"/><circle cx="228" cy="234" r="8" fill="#16140a"/>
  <circle cx="294" cy="232" r="30" fill="#fff6cc" opacity=".35" stroke="#E6B23C" stroke-width="9"/>
  <circle cx="294" cy="234" r="11" fill="#fff"/><circle cx="296" cy="236" r="6" fill="#16140a"/>
  <path d="M318 258 q20 30 6 70" stroke="#E6B23C" stroke-width="5" fill="none"/>
  <g transform="translate(150 380) rotate(-12)"><polygon points="0,-26 22,0 0,30 -22,0" fill="#7fd6ff" stroke="#fff" stroke-width="4"/><path d="M-22 0 H22" stroke="#fff" stroke-width="3" opacity=".7"/></g>
  <path d="M120 360 l10 -18 l10 18 l-10 18 z M400 220 l8 -14 l8 14 l-8 14 z" fill="#ffe08a"/>`),
kestrel: frame(['#3b2214', '#1d1009'], '#D27C4A', `
  <path d="M110 470 C120 330 170 260 256 260 C342 260 392 330 402 470 Z" fill="#c8693a"/>
  <path d="M190 470 C196 390 222 350 256 350 C290 350 316 390 322 470 Z" fill="#f3dcc1"/>
  <g fill="#7a3b1c"><circle cx="230" cy="400" r="7"/><circle cx="282" cy="420" r="7"/><circle cx="252" cy="446" r="7"/><circle cx="296" cy="380" r="6"/></g>
  <ellipse cx="256" cy="238" rx="104" ry="96" fill="#d97a43"/>
  <path d="M152 222 C170 150 220 138 256 138 C292 138 342 150 360 222 C320 196 192 196 152 222 Z" fill="#6f8fb0"/>
  ${antenna(256, 142, '#F4812F')}
  <path d="M196 262 C196 300 206 318 214 330" stroke="#2a1a10" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M316 262 C316 300 306 318 298 330" stroke="#2a1a10" stroke-width="12" fill="none" stroke-linecap="round"/>
  <rect x="166" y="210" width="180" height="56" rx="28" fill="#2a3430"/>
  <rect x="178" y="220" width="70" height="36" rx="18" fill="#9fd3f0"/><rect x="264" y="220" width="70" height="36" rx="18" fill="#9fd3f0"/>
  <path d="M188 230 L214 230" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".8"/><path d="M274 230 L300 230" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".8"/>
  <path d="M236 282 L276 282 L256 316 Z" fill="#F4A13A"/><path d="M256 316 L262 304" stroke="#2a1a10" stroke-width="5"/>
  <path d="M220 330 q36 14 60 -6" stroke="#2a1a10" stroke-width="6" fill="none" stroke-linecap="round"/>`),
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const [k, svg] of Object.entries(S)) {
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`);
    await p.screenshot({ path: `${k}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
    fs.writeFileSync(`${k}.svg`, svg);
  }
  await p.setContent(`<html><body style="margin:0;background:#0e1411;display:flex;gap:14px;padding:14px">${Object.keys(S).map((k) => `<img src="file://${process.cwd()}/${k}.png" width="190">`).join('')}</body></html>`);
  await p.setViewportSize({ width: 1030, height: 220 }); await p.screenshot({ path: 'all.png' });
  await b.close();
})();
