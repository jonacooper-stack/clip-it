// App Store screenshots: renders the real app (web build of the same code)
// with sample content, every network call answered locally, then frames each
// screen with a headline at 1320 x 2868 (6.9" iPhone).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const B = 'http://127.0.0.1:8791';
const SB = 'https://oybkykeoatfgcfqgaqpl.supabase.co';
const OUT = process.argv[2];
const RAW = path.join(OUT, 'raw');
fs.mkdirSync(RAW, { recursive: true });

const NOW = new Date('2026-11-10T16:20:00-05:00').getTime(); // Tuesday afternoon, New York
const H = 3600e3, DAY = 86400e3;
const lib = (slug) => `${B}/img/library/${slug}.jpg`;
const P = (slug, credit) => ({ url: lib(slug), credit, species: slug });
const ME = '11111111-1111-4111-8111-111111111111';

// ---------- journal ----------
let n = 0;
const score = (base, bonus = {}) => ({ basePoints: base, behaviorMultiplier: bonus.mult ?? 1, repeatMultiplier: 1, bonuses: { firstOfSpecies: 5, quest: 0, streak: bonus.streak ?? 0, fieldNotes: 0 }, totalPoints: 0, ruleVersion: 'scoring-v1' });
const s = (ago, sci, common, pts, group, slug, extra = {}) => {
  const sc = score(extra.base ?? Math.min(pts, 8), extra);
  sc.totalPoints = pts;
  return { id: `s${++n}`, createdAt: NOW - ago, observedAt: NOW - ago, idStatus: 'ai_confident', points: pts, sceneTags: extra.tags ?? [], source: 'ai', photoUri: lib(slug),
    species: { scientificName: sci, commonName: common, confidence: extra.conf ?? 0.95, group }, score: sc };
};
const sightings = [
  s(3.2 * H, 'Ochotona princeps', 'American pika', 34, 'mammal', 'american-pika-1', { base: 12, conf: 0.97, streak: 2 }),
  s(1 * DAY + 2 * H, 'Bison bison', 'American bison', 22, 'mammal', 'bison', { base: 8, tags: ['group_herd'], mult: 1.5 }),
  s(1 * DAY + 6 * H, 'Sciurus carolinensis', 'Eastern gray squirrel', 6, 'mammal', 'squirrel', { base: 1 }),
  s(4 * DAY, 'Alligator mississippiensis', 'American alligator', 41, 'reptile', 'american-alligator-1', { base: 9, tags: ['with_young'], mult: 3 }),
  s(6 * DAY, 'Canis lupus', 'Gray wolf', 38, 'mammal', 'wolf', { base: 14 }),
  s(9 * DAY, 'Canis lupus baileyi', 'Mexican wolf', 45, 'mammal', 'wolf-2', { base: 15 }),
];

// ---------- Scout content ----------
const items = [
  { group: 'mammal', species: 'White-tailed deer', sci: 'Odocoileus virginianus', emoji: '🦌', title: 'Deer are in the rut', facts: ['🦌 Bucks are on the move, looking for mates.', '🌅 Watch field edges at dawn and dusk. Drive slowly!', '🦴 Bucks grow brand-new antlers every year.'], photos: [P('white-tailed-deer-1', 'Charles J. Sharp · CC BY-SA 4.0'), P('mule-deer-1', 'Charles J. Sharp · CC BY-SA 4.0')] },
  { group: 'bird', species: 'Sandhill crane', sci: 'Grus canadensis', emoji: '🦩', title: 'Cranes are flying south', facts: ['🍂 Cranes fly south now to find warm places for winter.', '👂 Listen for loud, rattling calls high overhead.', '💃 Cranes dance! They jump, flap and bow.'], photos: [P('crane', 'Frank Schulenburg · CC BY-SA 4.0')] },
];
const forecast = { region: 'northeast', weekOf: '2026-11-09', headline: '🍂 Fall is on the move!', items };
const today = { region: 'northeast', date: '2026-11-10', species: 'Red fox', sci: 'Vulpes vulpes',
  photo: P('fox-portrait', 'ClaudiaTen · CC BY-SA 4.0'), photos: [P('fox-portrait', 'ClaudiaTen · CC BY-SA 4.0'), P('fox-vole', 'Andrey Gulivanov · CC BY 2.0'), P('fox-drink', 'Alexis Lours · CC BY 4.0')],
  facts: ['🦊 Foxes use their fluffy tails like a warm blanket.', '👂 They can hear a mouse moving under the snow.', '🦘 They pounce on mice with a big, high jump.', '🌙 Most foxes hunt at night and nap by day.', '🏡 Fox families live in dens with several doors.'], tip: '🔎 Look along field edges at dawn.' };
const storyPages = [
  { heading: 'Bucks on a mission', emoji: '🦌', text: 'It’s rut season! Male deer, called bucks, are busy looking for mates. They wander farther than usual, even in daylight.', photo: P('white-tailed-deer-1', 'Charles J. Sharp · CC BY-SA 4.0') },
  { heading: 'Why all the fuss?', emoji: '💪', text: 'Bucks show off to win a mate. They rub their antlers on trees and sometimes spar with other bucks.' },
  { heading: 'When it happens', emoji: '📅', text: 'In much of North America the rut peaks in November. Deer are most active at dawn and dusk.' },
  { heading: 'Look and listen', emoji: '👀', text: 'Look for scraped bark on small trees and bare patches on the ground. You might even hear antlers clack!' },
  { heading: 'Wow fact', emoji: '🦴', text: 'Bucks grow a brand-new set of antlers every year, then drop them in winter.' },
  { heading: 'Be a good explorer', emoji: '🚗', text: 'Bucks in the rut are distracted. Give them lots of space. Mission: spot a deer this week!' },
];
const storyId = ['theme', 'northeast', '2026-11-09', 'odocoileus virginianus', 'deer are in the rut'].join('|');

// ---------- the community wall (sample people and posts) ----------
const people = [
  { id: '22222222-2222-4222-8222-222222222222', display_name: 'trail_mara' },
  { id: '33333333-3333-4333-8333-333333333333', display_name: 'Leo K.' },
  { id: '44444444-4444-4444-8444-444444444444', display_name: 'Priya S.' },
];
const iso = (t) => new Date(t).toISOString();
const posts = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: people[0].id, common_name: 'American alligator', scientific_name: 'Alligator mississippiensis', points: 41, caption: 'Mama gator with a back full of babies 🐊', photo_url: lib('american-alligator-1'), created_at: iso(NOW - 4.6 * H), likes: 24, comments: 6 },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: people[1].id, common_name: 'Mexican wolf', scientific_name: 'Canis lupus baileyi', points: 45, caption: 'Out on a run at sunrise. Took my breath away.', photo_url: lib('wolf-2'), created_at: iso(NOW - 7.5 * H), likes: 18, comments: 4 },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', user_id: people[2].id, common_name: 'American bison', scientific_name: 'Bison bison', points: 22, caption: 'Big fella crossing the road. We waited!', photo_url: lib('bison'), created_at: iso(NOW - 26 * H), likes: 11, comments: 2 },
];
const likeRows = posts.flatMap((p) => Array.from({ length: p.likes }, (_, i) => ({ post_id: p.id, user_id: i === 0 && p === posts[0] ? ME : `liker-${p.id}-${i}` })));
const commentRows = posts.flatMap((p) => Array.from({ length: p.comments }, () => ({ post_id: p.id })));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'riley@example.com', user_metadata: { displayName: 'Riley', ageBracket: 'adult', homeRegion: 'northeast' }, app_metadata: { provider: 'email' }, created_at: iso(NOW - 40 * DAY) };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: Math.floor(NOW / 1000) + 30 * 86400 })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(NOW / 1000) + 30 * 86400, refresh_token: 'demo-refresh', user };

async function answer(route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'content-range': '0-0/0', ...headers }, body: JSON.stringify(body) });
  if (url.pathname.startsWith('/auth/v1/user')) return json(user);
  if (url.pathname.startsWith('/auth/v1/token')) return json(session);
  if (url.pathname.startsWith('/auth/')) return json({});
  const table = url.pathname.replace('/rest/v1/', '');
  if (req.method() !== 'GET' && req.method() !== 'HEAD') return json([], 201);
  if (table === 'feed_posts') return json(posts.map(({ likes, comments, ...p }) => p));
  if (table === 'profiles') return json([{ id: ME, display_name: 'Riley', avatar_url: null, is_bot: false, points: 186, species_count: 6 }, ...people.map((p) => ({ ...p, avatar_url: null, is_bot: false, points: 300, species_count: 20 }))]);
  if (table === 'post_likes') return json(likeRows);
  if (table === 'post_comments') return json(commentRows);
  return json([]);
}

const STATE = {
  'clipit-app': { state: { hasOnboarded: true, ageBracket: 'adult', isChild: false, displayName: 'Riley', avatarUrl: null, streakCount: 6, lastActiveDate: '2026-11-10', saveToCameraRoll: true, showCrew: true, homeRegion: 'northeast', discoverable: true }, version: 0 },
  'clipit-journal': { state: { sightings }, version: 0 },
  'clipit-crew': { state: { forecasts: { 'northeast:2026-11-09': forecast }, today: { 'northeast:2026-11-10': today }, people: { fetchedAt: NOW - 30 * DAY, people: [] }, followed: [], stories: { [storyId]: { key: 'k', kind: 'theme', title: 'Deer are in the rut', species: 'White-tailed deer', pages: storyPages, fetchedAt: NOW } }, hiddenPhotos: [] }, version: 4 },
  'sb-oybkykeoatfgcfqgaqpl-auth-token': session,
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 440, height: 902 }, deviceScaleFactor: 3, timezoneId: 'America/New_York', locale: 'en-US' });
  await ctx.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, JSON.stringify(v)); }, STATE);
  await ctx.route(`${SB}/**`, answer);
  await ctx.route(`${B}/api/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().url().includes('/people') ? { people: [] } : {}) }));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: path.join(RAW, `${name}.png`) }); };
  const scroller = (fn) => page.evaluate(fn);

  await page.goto(`${B}/sighting/s1`, { waitUntil: 'networkidle' });
  await shot('1-identify');

  await page.goto(`${B}/feed`, { waitUntil: 'networkidle' });
  await shot('2-scout');

  await page.goto(`${B}/story?kind=theme&species=${encodeURIComponent('White-tailed deer')}&sci=${encodeURIComponent('Odocoileus virginianus')}&title=${encodeURIComponent('Deer are in the rut')}&region=northeast&weekOf=2026-11-09&emoji=${encodeURIComponent('🦌')}`, { waitUntil: 'networkidle' });
  await shot('3-story');

  await page.goto(`${B}/feed`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await scroller(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent === 'trail_mara');
    const sc = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY !== 'visible').sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el && sc) sc.scrollTop += el.getBoundingClientRect().top - 78;
  });
  await shot('4-wall');

  await page.goto(`${B}/journal`, { waitUntil: 'networkidle' });
  await shot('5-journal');

  await page.goto(`${B}/quests`, { waitUntil: 'networkidle' });
  await shot('6-quests');

  console.log('errors', errors);
  await browser.close();
})();
