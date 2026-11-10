// Scout's posts in the feed. Each "moment" is one Instagram-style post: a row
// of swipeable slides, each with one picture (or one big emoji) and one short
// line. Every post is about ONE animal or ONE theme, and swiping goes deeper:
// another photo of the same animal with another fact. Built from the journal,
// this week's quests and Scout's cached content. Nothing is stored; it's
// recomputed, so it's always in sync.
//
// How often Scout posts (so the feed stays lively but never noisy):
//   - one story a day: Monday is "This week near you" (a quick look at the
//     week's themes); Tuesday, Thursday and Saturday dig into one of those
//     themes; Wednesday, Friday and Sunday are the animal of the day
//   - "Explorers you might like" once a week (people to follow)
//   - plus moments the player earns: a new species, a quest done, a milestone,
//     a one-year-ago memory, and the week's best photos on Sunday evening.
import type { CrewPhoto, Sighting } from '@/types';
import type { Forecast, ForecastItem, PeopleSuggestions, TodayPick } from '@/state/useCrewStore';
import type { StoryRef } from './api';
import { regionByKey, withArticle, type RegionKey } from '../../../shared/crew';
import { challengeStatus, SWEEP_BONUS, type ChallengeStatus, type GroupOf } from './challenges';
import { addDays, addWeeks, DAY_MS, hash, localDateStart, startOfDay, startOfWeek } from './time';

export type Tone = 'green' | 'orange' | 'blue' | 'gold' | 'clay';

export interface Slide {
  key: string;
  photo?: { uri: string; credit?: string; source?: string; species?: string }; // credit = a Scout photo (can be reported)
  emoji?: string; // shown big when there's no photo
  kicker?: string; // small label above, e.g. "Osprey · 2 of 5"
  title?: string;
  text?: string; // one short line (shown big when there's no title)
  bullets?: string[]; // only for the quest slide
  tone?: Tone; // background for emoji slides
  href?: string;
  cta?: string;
  follow?: { userId: string; name: string }; // a Follow button (people suggestions)
  story?: StoryRef; // tapping the slide opens this story (else the post's)
}

export type MomentKind =
  | 'region'
  | 'weekly'
  | 'daily'
  | 'theme'
  | 'people'
  | 'first_species'
  | 'quest_done'
  | 'milestone'
  | 'memory'
  | 'picks';

export interface Moment {
  id: string;
  kind: MomentKind;
  at: number;
  caption: string;
  slides: Slide[];
  story?: StoryRef; // "Read the story": the deeper story behind the post
}

export const MOMENT_WINDOW_MS = 10 * DAY_MS;

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';
const pick = <T,>(xs: T[], seed: string) => xs[hash(seed) % xs.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ref = (p?: CrewPhoto | null) => (p ? { uri: p.url, credit: p.credit, source: p.source, species: p.species } : undefined);

export const GROUP_EMOJI: Record<string, string> = {
  bird: '🐦', mammal: '🦌', fish: '🐟', reptile: '🐢', amphibian: '🐸', insect: '🦋', other: '🌿',
};
const GROUP_TONE: Record<string, Tone> = {
  bird: 'blue', mammal: 'clay', fish: 'blue', reptile: 'green', amphibian: 'green', insect: 'gold', other: 'green',
};
const TONES: Tone[] = ['blue', 'green', 'clay', 'gold', 'orange'];

// Scout's facts start with an emoji ("🦉 Owls can turn their heads…"). Split
// it off so an emoji slide can show it big.
export function splitEmoji(text: string): { emoji?: string; rest: string } {
  const t = text.trim();
  const i = t.indexOf(' ');
  if (i > 0 && i <= 8 && !/[A-Za-z0-9]/.test(t.slice(0, i))) return { emoji: t.slice(0, i), rest: t.slice(i + 1).trim() };
  return { rest: t };
}

// Order this week's themes by what the player logs most.
export function personaliseForecast(items: ForecastItem[], sightings: Sighting[], groupOf: GroupOf): ForecastItem[] {
  const counts = new Map<string, number>();
  for (const s of sightings.filter(COUNTED)) {
    const g = groupOf(s);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...items].filter((it) => it.title && it.facts?.length).sort((a, b) => (counts.get(b.group) ?? 0) - (counts.get(a.group) ?? 0));
}

// Spread n photos over m slides (photo first), so a story with fewer photos
// than facts alternates photos and emoji slides instead of bunching them.
export function photoSlots(nPhotos: number, nSlides: number): number[] {
  if (nPhotos <= 0) return [];
  if (nPhotos >= nSlides) return Array.from({ length: nSlides }, (_, i) => i);
  return Array.from({ length: nPhotos }, (_, k) => Math.round((k * nSlides) / nPhotos));
}

// A story: one fact per slide about one subject, each with its own photo
// when there is one (otherwise the fact's emoji, big, on a colored card).
export function storySlides(opts: {
  key: string;
  subject: string; // used in the small label, e.g. "Osprey"
  lines: string[];
  photos: CrewPhoto[];
  first?: { kicker: string; title: string }; // the cover slide
  fallbackEmoji: string;
}): Slide[] {
  const { lines, photos } = opts;
  const slots = photoSlots(photos.length, lines.length);
  return lines.map((line, i) => {
    const slot = slots.indexOf(i);
    const photo = slot >= 0 ? ref(photos[slot]) : undefined;
    const label = lines.length > 1 ? `${opts.subject} · ${i + 1} of ${lines.length}` : opts.subject;
    const head = i === 0 && opts.first ? { kicker: opts.first.kicker, title: opts.first.title } : { kicker: label };
    if (photo) return { key: `${opts.key}${i}`, photo, ...head, text: line };
    const { emoji, rest } = splitEmoji(line);
    return { key: `${opts.key}${i}`, emoji: emoji ?? opts.fallbackEmoji, ...head, text: rest, tone: TONES[i % TONES.length] };
  });
}

export function questSlide(status: ChallengeStatus[], key: string): Slide {
  const done = status.filter((c) => c.done).length;
  if (status.length && done === status.length) {
    return { key, emoji: '🏆', title: 'All your quests are done!', text: `+${SWEEP_BONUS} bonus points. New quests on Monday.`, tone: 'gold', href: '/quests', cta: 'See quests' };
  }
  return {
    key,
    emoji: '🎯',
    title: done ? `${done} of ${status.length} quests done` : 'Your quests this week',
    bullets: status.map((c) => `${c.done ? '✅' : '⬜️'} ${c.def.title}: ${c.progress}/${c.def.goal}`),
    tone: 'green',
    href: '/quests',
    cta: 'See quests',
  };
}

function findSlide(species: string, emoji: string): Slide {
  return { key: 'find', emoji: emoji || '📸', title: `Can you find ${withArticle(species.toLowerCase())}?`, text: 'Snap one and it goes in your journal.', tone: 'orange', href: '/capture/camera', cta: 'Open camera' };
}

// One theme from this week's "near you" list, in depth.
function themeStory(it: ForecastItem, key: string, photos: CrewPhoto[]): Slide[] {
  return [
    ...storySlides({
      key,
      subject: it.species,
      lines: it.facts,
      photos,
      first: { kicker: 'Near you this week', title: it.title },
      fallbackEmoji: it.emoji || GROUP_EMOJI[it.group] || '🌿',
    }),
    findSlide(it.species, it.emoji),
  ];
}

// The animal of the day, in depth: a different photo with each fact.
function animalStory(t: TodayPick, photos: CrewPhoto[]): Slide[] {
  const slides = storySlides({
    key: 'a',
    subject: t.species,
    lines: t.facts,
    photos,
    first: { kicker: 'Animal of the day', title: t.species },
    fallbackEmoji: '🌟',
  });
  if (t.tip) {
    const { emoji, rest } = splitEmoji(t.tip);
    slides.push({ key: 'tip', emoji: emoji ?? '🔎', kicker: t.species, title: 'How to spot one', text: rest, tone: 'gold' });
  }
  return slides;
}

export function buildMoments(opts: {
  sightings: Sighting[];
  now?: number;
  region: RegionKey | null;
  forecasts: Forecast[]; // cached weekly themes for the player's region
  today: TodayPick[]; // cached animals of the day for the player's region
  people?: PeopleSuggestions | null;
  hidden?: string[]; // photo URLs this player reported
  seed: string;
  groupOf: GroupOf;
  bigQuests?: { id: string; title: string; reward: number; doneAt?: number }[];
}): Moment[] {
  const now = opts.now ?? Date.now();
  const { sightings, seed, groupOf } = opts;
  const out: Moment[] = [];
  const recent = (t: number) => t <= now && now - t < MOMENT_WINDOW_MS;
  const counted = sightings.filter(COUNTED).sort((a, b) => a.observedAt - b.observedAt);
  const week = startOfWeek(now);
  const thisWeek = challengeStatus(week, sightings, seed, groupOf);
  const regionLabel = opts.region ? regionByKey(opts.region)?.label ?? 'your area' : 'your area';
  const hidden = new Set(opts.hidden ?? []);
  const vis = (ps?: (CrewPhoto | null | undefined)[] | null): CrewPhoto[] => (ps ?? []).filter((p): p is CrewPhoto => Boolean(p) && !hidden.has(p!.url));

  if (!opts.region) {
    out.push({
      id: 'region',
      kind: 'region',
      at: now,
      caption: 'Tell me where you explore and I’ll show you what animals are up to near you, every day.',
      slides: [
        {
          key: 'region',
          emoji: '🗺️',
          title: 'Where do you explore?',
          text: 'Pick your home region to get daily animal stories.',
          tone: 'orange',
          href: '/region',
          cta: 'Pick my region',
        },
      ],
    });
  }

  // ---------- Scout's two stories a day ----------
  // Morning (7am): Monday is a quick look at the week's themes; Tuesday to
  // Sunday dig into one theme each. Afternoon (2pm): the animal of the day.
  // Today's first story ends with the quest slide.
  const byWeek = new Map(opts.forecasts.map((f) => [startOfWeek(localDateStart(f.weekOf) + 12 * 3600_000), f]));
  const byDate = new Map(opts.today.map((t) => [startOfDay(localDateStart(t.date) + 12 * 3600_000), t]));
  let questSlideUsed = false;
  const questsFor = (day: number, at: number) => {
    if (questSlideUsed || day !== startOfDay(now) || at > now || !thisWeek.some((c) => !c.done)) return [];
    questSlideUsed = true;
    return [questSlide(thisWeek, 'quests')];
  };
  for (let d = 9; d >= 0; d--) {
    const day = startOfDay(addDays(now, -d));
    const wk = startOfWeek(day);
    const f = byWeek.get(wk);
    const items = f ? personaliseForecast(f.items, sightings, groupOf) : [];
    const dow = Math.round((day - wk) / DAY_MS); // 0 = Monday … 6 = Sunday
    const t = byDate.get(day);

    const morning = day + 7 * 3600_000;
    if (recent(morning) && items.length) {
      const themeRef = (it: ForecastItem): StoryRef => ({ kind: 'theme', species: it.species, sci: it.sci || undefined, title: it.title, region: f!.region, weekOf: f!.weekOf });
      if (dow === 0) {
        // A quick look at the week's themes (one slide each; tap one for its story).
        const slides: Slide[] = items.slice(0, 6).map((it, i) => {
          const photo = ref(vis(it.photos)[0]);
          const { emoji, rest } = splitEmoji(it.facts[0]);
          const base = { key: `w${i}`, kicker: it.species, title: it.title, story: themeRef(it) };
          return photo
            ? { ...base, photo, text: it.facts[0] }
            : { ...base, emoji: emoji ?? (it.emoji || GROUP_EMOJI[it.group]), text: rest, tone: GROUP_TONE[it.group] ?? 'green' };
        });
        out.push({
          id: `weekly:${f!.weekOf}`,
          kind: 'weekly',
          at: morning,
          caption: `${f!.headline || 'This week near you'} Here’s what’s happening around the ${regionLabel}. Tap one to read its story. I’ll dig into each one this week!`,
          slides: [...slides, ...questsFor(day, morning)],
        });
      } else {
        const it = items[(dow - 1) % items.length];
        out.push({
          id: `theme:${day}`,
          kind: 'theme',
          at: morning,
          caption: `${it.emoji ? `${it.emoji} ` : ''}${it.title}! Here’s what’s going on and where to look.`,
          slides: [...themeStory(it, 't', vis(it.photos)), ...questsFor(day, morning)],
          story: themeRef(it),
        });
      }
    }

    const afternoon = day + 14 * 3600_000;
    if (recent(afternoon) && t?.facts.length) {
      out.push({
        id: `daily:${day}`,
        kind: 'daily',
        at: afternoon,
        caption: pick(
          [`Meet today’s animal: the ${t.species.toLowerCase()}! 🌟`, `Today’s animal is the ${t.species.toLowerCase()} 🦊`, `Say hi to the ${t.species.toLowerCase()}, today’s animal 👋`],
          `${seed}:${day}`,
        ),
        slides: [...animalStory(t, vis(t.photos?.length ? t.photos : [t.photo])), ...questsFor(day, afternoon)],
        story: { kind: 'species', species: t.species, sci: t.sci || undefined, region: t.region },
      });
    }
  }

  // ---------- explorers you might like (weekly) ----------
  const ppl = opts.people;
  if (ppl && ppl.people.length && recent(ppl.fetchedAt)) {
    const slides: Slide[] = ppl.people.slice(0, 6).map((p) => {
      const best = p.posts[0];
      return {
        key: `p:${p.userId}`,
        photo: best ? { uri: best.photoUrl } : undefined,
        emoji: '👋',
        kicker: 'Explorer you might like',
        title: p.name,
        text: p.reason,
        tone: 'blue' as Tone,
        href: best ? `/post/${best.postId}` : undefined,
        follow: { userId: p.userId, name: p.name },
      };
    });
    slides.push({ key: 'more', emoji: '🔭', title: 'Find more explorers', text: 'Search for friends in Community.', tone: 'green', href: '/social', cta: 'Open Community' });
    out.push({
      id: `people:${ppl.fetchedAt}`,
      kind: 'people',
      at: ppl.fetchedAt,
      caption: 'Explorers you might like 👋 Follow them to see their finds in your feed.',
      slides,
    });
  }

  // ---------- a new species ----------
  const seen = new Set<string>();
  counted.forEach((s) => {
    const key = s.species?.scientificName || s.species?.commonName;
    if (!key || seen.has(key)) return;
    seen.add(key);
    const n = seen.size;
    const at = s.observedAt + 4000;
    if (!recent(at)) return;
    const name = s.species!.commonName || 'wild animal';
    const g = groupOf(s) ?? 'other';
    const slides: Slide[] = [
      {
        key: 'yours',
        photo: s.photoUri ? { uri: s.photoUri } : undefined,
        emoji: GROUP_EMOJI[g] ?? '🌿',
        kicker: n === 1 ? 'Your first animal!' : 'New species!',
        title: n === 1 ? `${cap(withArticle(name))}!` : `${name}!`,
        text: s.points ? `+${s.points} points for your journal` : undefined,
        tone: 'orange',
        href: `/sighting/${s.id}`,
      },
    ];
    const notes = s.crew;
    if (notes) {
      const photos = vis(notes.photos?.length ? notes.photos : [notes.photo]);
      slides.push(...storySlides({ key: 'f', subject: name, lines: notes.facts, photos, fallbackEmoji: GROUP_EMOJI[g] ?? '💡' }));
      if (notes.tip) {
        const { emoji, rest } = splitEmoji(notes.tip);
        slides.push({ key: 'tip', emoji: emoji ?? '🔎', kicker: name, title: 'How to spot one', text: rest, tone: 'gold' });
      }
      for (const o of notes.others.slice(0, 3)) {
        slides.push({ key: `o:${o.postId}`, photo: { uri: o.photoUrl }, kicker: 'Other explorers', title: `${o.name} saw one too`, text: o.likes ? `♥ ${o.likes}` : undefined, href: `/post/${o.postId}` });
      }
    }
    out.push({
      id: `first:${s.id}`,
      kind: 'first_species',
      at,
      caption: n === 1 ? 'Your very first species! 🎉' : `Species #${n} in your journal! 🎉`,
      slides,
      story: { kind: 'species', species: name, sci: s.species!.scientificName || undefined, region: opts.region ?? undefined },
    });
  });

  // ---------- quests done (this week and last) ----------
  for (const wk of [week, addWeeks(week, -1)]) {
    const status = wk === week ? thisWeek : challengeStatus(wk, sightings, seed, groupOf);
    for (const c of status) {
      if (!c.done || !c.doneAt || !recent(c.doneAt + 1000)) continue;
      out.push({
        id: `quest:${wk}:${c.def.id}`,
        kind: 'quest_done',
        at: c.doneAt + 1000,
        caption: pick(['Quest complete! Nice work 🦊', 'Boom! Another quest done.', 'You did it! 🎯'], `${c.def.id}:${wk}`),
        slides: [{ key: 'q', emoji: '🎯', title: `Quest complete: ${c.def.title}`, text: `+${c.def.reward} points`, tone: 'green', href: '/quests' }],
      });
    }
    if (status.length && status.every((c) => c.done)) {
      const last = Math.max(...status.map((c) => c.doneAt ?? 0)) + 1500;
      if (recent(last)) {
        out.push({
          id: `sweep:${wk}`,
          kind: 'quest_done',
          at: last,
          caption: 'You finished every quest this week. Legend! 🏆',
          slides: [{ key: 's', emoji: '🏆', title: 'All quests done!', text: `+${SWEEP_BONUS} bonus points`, tone: 'gold', href: '/quests' }],
        });
      }
    }
  }
  for (const q of opts.bigQuests ?? []) {
    if (!q.doneAt || !recent(q.doneAt + 1200)) continue;
    out.push({
      id: `bigquest:${q.id}`,
      kind: 'quest_done',
      at: q.doneAt + 1200,
      caption: 'A big quest, done! 🏆',
      slides: [{ key: 'b', emoji: '🏆', title: `Big quest complete: ${q.title}`, text: `+${q.reward} points`, tone: 'gold', href: '/quests' }],
    });
  }

  // ---------- milestones ----------
  const speciesMilestones = new Set([5, 10, 25, 50, 100, 200]);
  const sightingMilestones = new Set([10, 25, 50, 100, 250]);
  const seen2 = new Set<string>();
  counted.forEach((s, i) => {
    const key = s.species?.scientificName || s.species?.commonName;
    if (key && !seen2.has(key)) {
      seen2.add(key);
      if (speciesMilestones.has(seen2.size) && recent(s.observedAt + 2000)) {
        out.push({
          id: `ms:species:${seen2.size}`,
          kind: 'milestone',
          at: s.observedAt + 2000,
          caption: 'Milestone unlocked! 🏅',
          slides: [{ key: 'm', emoji: '🏅', title: `${seen2.size} species!`, text: 'Your journal keeps growing.', tone: 'gold', href: '/journal' }],
        });
      }
    }
    if (sightingMilestones.has(i + 1) && recent(s.observedAt + 3000)) {
      out.push({
        id: `ms:sightings:${i + 1}`,
        kind: 'milestone',
        at: s.observedAt + 3000,
        caption: 'Milestone unlocked! 🏅',
        slides: [{ key: 'm', emoji: '📸', title: `${i + 1} sightings!`, text: 'Every one of them a moment outside.', tone: 'gold', href: '/journal' }],
      });
    }
  });

  // ---------- one year ago today ----------
  for (let d = 0; d < 7; d++) {
    const day = startOfDay(addDays(now, -d));
    const yearAgo = addDays(day, -365);
    const memory = counted.find((s) => s.observedAt >= yearAgo && s.observedAt < addDays(yearAgo, 1) && s.species?.commonName);
    const at = day + 7 * 3600_000 + 60_000;
    if (!memory || !recent(at)) continue;
    out.push({
      id: `memory:${memory.id}`,
      kind: 'memory',
      at,
      caption: 'Remember this one? 📅',
      slides: [
        {
          key: 'mem',
          photo: memory.photoUri ? { uri: memory.photoUri } : undefined,
          emoji: '📅',
          title: `One year ago: ${memory.species!.commonName}`,
          text: 'Same time of year. It might be back!',
          tone: 'blue',
          href: `/sighting/${memory.id}`,
        },
      ],
    });
  }

  return mergeSameOuting(out).sort((a, b) => b.at - a.at);
}

// One sighting can unlock several things at once (a new species, a quest, a
// milestone). Fold everything earned within 30 minutes into one post, so the
// feed gets one celebration per outing instead of a pile of cards.
const EVENT_KINDS: ReadonlySet<MomentKind> = new Set<MomentKind>(['first_species', 'quest_done', 'milestone']);
const SHORT_CAPTION: Partial<Record<MomentKind, string>> = { quest_done: 'Quest complete! 🎯', milestone: 'Milestone unlocked! 🏅' };

export function mergeSameOuting(moments: Moment[]): Moment[] {
  const events = moments.filter((m) => EVENT_KINDS.has(m.kind)).sort((a, b) => a.at - b.at);
  const rest = moments.filter((m) => !EVENT_KINDS.has(m.kind));
  const groups: Moment[][] = [];
  for (const m of events) {
    const g = groups[groups.length - 1];
    if (g && m.at - g[0].at <= 30 * 60_000) g.push(m);
    else groups.push([m]);
  }
  for (const g of groups) {
    if (g.length === 1) {
      rest.push(g[0]);
      continue;
    }
    const firsts = g.filter((m) => m.kind === 'first_species');
    const primary = firsts[0] ?? g[0];
    const others = g.filter((m) => m !== primary);
    const extraFirsts = others.filter((m) => m.kind === 'first_species');
    const wins = others.filter((m) => m.kind !== 'first_species');
    // Your photo first, then what you unlocked, then the fun facts.
    const slides = [primary.slides[0], ...wins.flatMap((m) => m.slides), ...primary.slides.slice(1), ...extraFirsts.flatMap((m) => m.slides)];
    const seen = new Set<string>();
    const extras = [extraFirsts.length ? `Plus ${extraFirsts.length} more new species!` : '', ...wins.map((m) => SHORT_CAPTION[m.kind] ?? '')]
      .filter((c) => c && !seen.has(c) && seen.add(c));
    rest.push({
      ...primary,
      id: [primary, ...others].map((m) => m.id).join('+'),
      at: Math.max(...g.map((m) => m.at)),
      caption: [primary.caption, ...extras].join(' '),
      slides: slides.map((sl, i) => ({ ...sl, key: `${i}:${sl.key}` })),
    });
  }
  return rest;
}

// The week's best photos on the wall, every Sunday at 5pm.
export function weeklyPicks(
  posts: { id: string; photoUrl: string | null; likeCount: number; createdAt: string; displayName: string; commonName: string | null; isBot: boolean }[],
  now = Date.now(),
): Moment | null {
  const today = startOfDay(now);
  let at = addDays(today, -new Date(today).getDay()) + 17 * 3600_000; // last Sunday 5pm
  if (at > now) at = addDays(at, -7);
  const top = posts
    .filter((p) => !p.isBot && p.photoUrl && p.likeCount > 0 && Date.parse(p.createdAt) <= at && Date.parse(p.createdAt) > at - 7 * DAY_MS)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 5);
  if (top.length < 2 || now - at > MOMENT_WINDOW_MS) return null;
  return {
    id: `picks:${at}`,
    kind: 'picks',
    at,
    caption: 'The best photos on the wall this week 📸',
    slides: top.map((p, i) => ({
      key: `p${i}`,
      photo: { uri: p.photoUrl! },
      title: p.commonName ? cap(p.commonName) : 'Wild sighting',
      text: `📸 ${p.displayName} · ♥ ${p.likeCount}`,
      href: `/post/${p.id}`,
    })),
  };
}
