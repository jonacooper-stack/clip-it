// Frame each raw screen: headline + phone with status bar, 1320 x 2868.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
const FONT = path.resolve(__dirname, '../../node_modules/@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf');
const FONT_M = path.resolve(__dirname, '../../node_modules/@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf');
const shots = [
  ['1-identify', 'Snap any <em>wild animal</em>', 'AI names it in seconds and scores your find'],
  ['2-scout', 'Meet <em>Scout</em>, your AI guide', 'New posts about animals near you, every day'],
  ['3-story', 'Tap in for the <em>whole story</em>', 'Why animals do what they do, and where to look'],
  ['4-wall', 'Share your <em>best finds</em>', 'Like, comment and follow other explorers'],
  ['5-journal', 'Build your <em>field journal</em>', 'Every sighting saved with its photo and date'],
  ['6-quests', 'New <em>quests</em> every week', 'Keep your streak going and climb the leaderboard'],
];
const statusBar = `
<div class="sb"><span class="time">9:41</span><span class="island"></span>
<span class="icons">
  <svg width="54" height="34" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#fff"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#fff"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#fff"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#fff"/></svg>
  <svg width="48" height="34" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0z" fill="#fff"/><path d="M2.9 6.3a7.3 7.3 0 0 1 10.2 0l-1.5 1.5a5.2 5.2 0 0 0-7.2 0z" fill="#fff"/><path d="M.2 3.6a11.2 11.2 0 0 1 15.6 0l-1.5 1.5a9.1 9.1 0 0 0-12.6 0z" fill="#fff"/></svg>
  <svg width="80" height="36" viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".45"/><rect x="2" y="2" width="20" height="8" rx="2" fill="#fff"/><rect x="24.6" y="4" width="1.6" height="4" rx=".8" fill="#fff" fill-opacity=".45"/></svg>
</span></div>`;
const html = (img, title, sub) => `<!doctype html><html><head><style>
@font-face { font-family: DM; src: url(file://${FONT}); font-weight: 700; }
@font-face { font-family: DMM; src: url(file://${FONT_M}); }
html, body { margin: 0; width: 1320px; height: 2868px; overflow: hidden; }
body { background: radial-gradient(120% 70% at 50% 0%, #1B4A2E 0%, #0E1411 62%); font-family: DM; color: #ECECE2; position: relative; }
.topo { position: absolute; inset: 0; opacity: .07; background: repeating-radial-gradient(circle at 18% 12%, transparent 0 46px, #9BA89A 46px 48px); }
.head { position: absolute; top: 0; left: 70px; right: 70px; height: 600px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 30px; }
h1 { margin: 0; font-size: 100px; line-height: 1.05; letter-spacing: -3px; text-align: center; }
h1 em { font-style: normal; color: #F4812F; }
p { margin: 0; font-family: DMM; font-size: 44px; line-height: 1.25; color: #B9C4B8; text-align: center; }
.phone { position: absolute; left: 160px; top: 610px; width: 1000px; height: 2173px; border-radius: 136px; background: #050806; box-shadow: 0 0 0 14px #1d2520, 0 0 0 16px #39443c, 0 60px 120px rgba(0,0,0,.55); overflow: hidden; }
.sb { position: absolute; top: 0; left: 0; right: 0; height: 123px; display: flex; align-items: center; justify-content: space-between; padding: 0 84px 0 108px; box-sizing: border-box; background: #0E1411; z-index: 2; }
.time { font-family: DM; font-size: 42px; color: #fff; letter-spacing: -.5px; }
.island { position: absolute; left: 50%; top: 24px; width: 286px; height: 84px; margin-left: -143px; background: #000; border-radius: 42px; }
.icons { display: flex; gap: 14px; align-items: center; }
.screen { position: absolute; top: 123px; left: 0; width: 1000px; height: 2050px; }
.story .sb { background: #000; }
</style></head><body><div class="topo"></div>
<div class="head"><h1>${title}</h1><p>${sub}</p></div>
<div class="phone ${img.includes('3-story') ? 'story' : ''}">${statusBar}<img class="screen" src="file://${img}"></div>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
  for (const [name, title, sub] of shots) {
    const f = path.join(DIR, 'frame.html');
    fs.writeFileSync(f, html(path.join(DIR, 'raw', `${name}.png`), title, sub));
    await page.goto(`file://${f}`); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, `${name}.png`), type: 'png' });
  }
  await b.close();
})();
