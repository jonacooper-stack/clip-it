import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMoments, mergeSameOuting, photoSlots, splitEmoji, weeklyPicks, type Moment } from '../src/lib/crew/moments';
import type { Forecast, TodayPick } from '../src/state/useCrewStore';
import type { Sighting } from '../src/types';

const groupOf = (s: Sighting) => s.species?.group;
const photo = (n: number) => ({ url: `https://clipitwildlife.app/img/library/p${n}.jpg`, credit: `Credit ${n}`, species: 'x', source: 'https://clipitwildlife.app/credits.html' });
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Wednesday 11 Nov 2026, 8pm local.
const now = local(2026, 11, 11, 20);
const forecast: Forecast = {
  region: 'northeast',
  weekOf: '2026-11-09',
  headline: 'Fall is in full swing!',
  items: ['Deer are in the rut', 'Jays are hiding acorns', 'Chipmunks stock up'].map((title, i) => ({
    group: i === 1 ? 'bird' : 'mammal', species: ['White-tailed deer', 'Blue jay', 'Eastern chipmunk'][i], sci: '', emoji: '🦌', title,
    facts: ['🦌 Something is happening.', '🌲 Look along forest edges.', '✨ A fun fact.'], photos: [photo(i)],
  })),
};
const today: TodayPick = {
  region: 'northeast', date: ymd(now), species: 'Eastern gray squirrel', sci: 'Sciurus carolinensis', photo: photo(9), photos: [photo(9), photo(10)],
  facts: ['🐿️ One.', '🌰 Two.', '🍼 Three.', '🤸 Four.', '🌳 Five.'], tip: '🔎 Look for a bushy tail.',
};
const base = { sightings: [] as Sighting[], now, region: 'northeast' as const, forecasts: [forecast], today: [today], seed: 'seed', groupOf };

test('with no home region, Scout asks for one (and posts nothing else from the server)', () => {
  const ms = buildMoments({ ...base, region: null, forecasts: [], today: [] });
  assert.deepEqual(ms.map((m) => m.kind), ['region']);
  assert.equal(ms[0].slides[0].href, '/region');
});

test('Scout posts twice a day: a morning theme and the afternoon animal of the day, newest first', () => {
  const ms = buildMoments(base);
  const kinds = ms.map((m) => m.kind);
  assert.ok(kinds.includes('daily') && kinds.includes('theme') && kinds.includes('weekly'), kinds.join(','));
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i - 1].at >= ms[i].at);
  const daily = ms.find((m) => m.kind === 'daily')!;
  assert.equal(new Date(daily.at).getHours(), 14);
  assert.equal(daily.slides[0].title, 'Eastern gray squirrel');
  assert.equal(daily.slides.filter((s) => s.photo).length, 2); // one slide per photo, the rest are emoji cards
  assert.deepEqual(daily.story, { kind: 'species', species: 'Eastern gray squirrel', sci: 'Sciurus carolinensis', region: 'northeast' });
  const weekly = ms.find((m) => m.kind === 'weekly')!; // Monday's overview: one slide per theme, each with its own story
  assert.equal(new Date(weekly.at).getDay(), 1);
  assert.equal(weekly.slides[0].story?.kind, 'theme');
  assert.equal(weekly.slides[0].story?.weekOf, '2026-11-09');
});

test('nothing is posted before its time', () => {
  const morning = buildMoments({ ...base, now: local(2026, 11, 11, 6) }); // 6am Wednesday
  assert.ok(!morning.some((m) => m.at > local(2026, 11, 11, 6)));
  assert.ok(!morning.some((m) => m.kind === 'daily')); // today's animal isn't out until 2pm
});

test('photos a player reported are not shown', () => {
  const ms = buildMoments({ ...base, hidden: [photo(9).url] });
  const daily = ms.find((m) => m.kind === 'daily')!;
  assert.ok(!daily.slides.some((s) => s.photo?.uri === photo(9).url));
});

test('a new species gets a celebration post built around the player\'s own photo', () => {
  const s: Sighting = {
    id: 's1', createdAt: now - 3600_000, observedAt: now - 3600_000, sceneTags: [], idStatus: 'ai_confident', points: 9, photoUri: 'photos/abc.jpg',
    species: { commonName: 'Osprey', scientificName: 'Pandion haliaetus', confidence: 0.95, group: 'bird' },
    crew: { facts: ['🐟 Ospreys eat fish.', '🪶 They dive feet first.'], tip: '🔎 Look near water.', others: [], photo: null, photos: [photo(1)], v: 4, fetchedAt: now },
  };
  const ms = buildMoments({ ...base, sightings: [s] });
  const first = ms.find((m) => m.kind === 'first_species')!;
  assert.equal(first.slides[0].photo?.uri, 'photos/abc.jpg');
  assert.equal(first.slides[0].href, '/sighting/s1');
  assert.match(first.caption, /very first species/i);
  assert.equal(first.story?.species, 'Osprey');
  // Rejected / ineligible photos never produce posts.
  const none = buildMoments({ ...base, sightings: [{ ...s, idStatus: 'ineligible' }] });
  assert.ok(!none.some((m) => m.kind === 'first_species'));
});

test('everything earned on one outing is folded into a single post', () => {
  const m = (id: string, kind: Moment['kind'], at: number): Moment => ({ id, kind, at, caption: id, slides: [{ key: id, title: id }] });
  const merged = mergeSameOuting([m('a', 'first_species', 1000), m('b', 'quest_done', 2000), m('c', 'milestone', 3000), m('d', 'milestone', 3000 + 31 * 60_000), m('e', 'daily', 500)]);
  assert.equal(merged.length, 3); // a+b+c together, d alone, the daily untouched
  const combo = merged.find((x) => x.id.includes('+'))!;
  assert.equal(combo.slides.length, 3);
  assert.equal(new Set(combo.slides.map((s) => s.key)).size, 3); // slide keys stay unique
});

test('helpers', () => {
  assert.deepEqual(splitEmoji('🦉 Owls turn their heads.'), { emoji: '🦉', rest: 'Owls turn their heads.' });
  assert.deepEqual(splitEmoji('Owls turn their heads.'), { rest: 'Owls turn their heads.' });
  assert.deepEqual(photoSlots(2, 5), [0, 3]);
  assert.deepEqual(photoSlots(0, 5), []);
  assert.deepEqual(photoSlots(7, 3), [0, 1, 2]);
});

test('the week\'s best photos need at least two liked posts, and never include Scout', () => {
  const sundayEvening = local(2026, 11, 8, 18); // Sunday 8 Nov, 6pm
  const post = (id: string, likes: number, isBot = false) => ({ id, photoUrl: `https://x/${id}.jpg`, likeCount: likes, createdAt: new Date(local(2026, 11, 6, 12)).toISOString(), displayName: 'Robin', commonName: 'Osprey', isBot });
  assert.equal(weeklyPicks([post('a', 3)], sundayEvening), null);
  const picks = weeklyPicks([post('a', 3), post('b', 5), post('c', 9, true), post('d', 0)], sundayEvening)!;
  assert.deepEqual(picks.slides.map((s) => s.href), ['/post/b', '/post/a']);
});
