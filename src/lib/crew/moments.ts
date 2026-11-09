// Scout's posts in the feed. Each "moment" is one Instagram-style post: a row
// of swipeable slides, each with one picture (or one big emoji) and one short
// line. Built from the journal, this week's quests and Scout's cached content.
// Nothing is stored; it's recomputed, so it's always in sync.
//
// How often Scout posts (so the feed stays lively but never noisy):
//   - one post a day: Monday is "This week near you"; the other days are
//     "Today with Scout" (the animal of the day plus one thing happening nearby)
//   - plus moments the player earns: a new species, a quest done, a milestone,
//     a one-year-ago memory, and the week's best photos on Sunday evening.
import type { Sighting } from '@/types';
import type { Forecast, ForecastItem, TodayPick } from '@/state/useCrewStore';
import { regionByKey, withArticle, type RegionKey } from '../../../shared/crew';
import { challengeStatus, SWEEP_BONUS, type ChallengeStatus, type GroupOf } from './challenges';
import { addDays, addWeeks, DAY_MS, hash, localDateStart, startOfDay, startOfWeek } from './time';

export type Tone = 'green' | 'orange' | 'blue' | 'gold' | 'clay';

export interface Slide {
  key: string;
  photo?: { uri: string; credit?: string };
  emoji?: string; // shown big when there's no photo
  title: string;
  text?: string; // one short line
  bullets?: string[]; // only for the quest slide
  tone?: Tone; // background for emoji slides
  href?: string;
  cta?: string;
}

export type MomentKind = 'region' | 'weekly' | 'daily' | 'first_species' | 'quest_done' | 'milestone' | 'memory' | 'picks';

export interface Moment {
  id: string;
  kind: MomentKind;
  at: number;
  caption: string;
  slides: Slide[];
}

export const MOMENT_WINDOW_MS = 10 * DAY_MS;

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';
const pick = <T,>(xs: T[], seed: string) => xs[hash(seed) % xs.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const GROUP_EMOJI: Record<string, string> = {
  bird: '🐦', mammal: '🦌', fish: '🐟', reptile: '🐢', amphibian: '🐸', insect: '🦋', other: '🌿',
};
const GROUP_TONE: Record<string, Tone> = {
  bird: 'blue', mammal: 'clay', fish: 'blue', reptile: 'green', amphibian: 'green', insect: 'gold', other: 'green',
};

// Scout's facts start with an emoji ("🦉 Owls can turn their heads…"). Split
// it off so an emoji slide can show it big.
export function splitEmoji(text: string): { emoji?: string; rest: string } {
  const t = text.trim();
  const i = t.indexOf(' ');
  if (i > 0 && i <= 8 && !/[A-Za-z0-9]/.test(t.slice(0, i))) return { emoji: t.slice(0, i), rest: t.slice(i + 1).trim() };
  return { rest: t };
}

// Order this week's animals by what the player logs most.
export function personaliseForecast(items: ForecastItem[], sightings: Sighting[], groupOf: GroupOf): ForecastItem[] {
  const counts = new Map<string, number>();
  for (const s of sightings.filter(COUNTED)) {
    const g = groupOf(s);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...items].filter((it) => it.title && it.fact).sort((a, b) => (counts.get(b.group) ?? 0) - (counts.get(a.group) ?? 0));
}

function forecastSlide(it: ForecastItem, key: string): Slide {
  return {
    key,
    photo: it.photo ? { uri: it.photo.url, credit: it.photo.credit } : undefined,
    emoji: it.emoji || GROUP_EMOJI[it.group] || '🌿',
    title: it.title,
    text: it.fact,
    tone: GROUP_TONE[it.group] ?? 'green',
  };
}

function factSlide(fact: string, key: string, opts: { photo?: Slide['photo']; title: string; fallbackEmoji: string; tone: Tone }): Slide {
  if (opts.photo) return { key, photo: opts.photo, title: opts.title, text: fact };
  const { emoji, rest } = splitEmoji(fact);
  return { key, emoji: emoji ?? opts.fallbackEmoji, title: opts.title, text: rest, tone: opts.tone };
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

export function buildMoments(opts: {
  sightings: Sighting[];
  now?: number;
  region: RegionKey | null;
  forecasts: Forecast[]; // cached weekly slides for the player's region
  today: TodayPick[]; // cached animals of the day for the player's region
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
          text: 'Pick your home region to get daily animal posts.',
          tone: 'orange',
          href: '/region',
          cta: 'Pick my region',
        },
      ],
    });
  }

  // ---------- one Scout post a day ----------
  const byWeek = new Map(opts.forecasts.map((f) => [startOfWeek(localDateStart(f.weekOf) + 12 * 3600_000), f]));
  const byDate = new Map(opts.today.map((t) => [startOfDay(localDateStart(t.date) + 12 * 3600_000), t]));
  for (let d = 0; d < 10; d++) {
    const day = startOfDay(addDays(now, -d));
    const wk = startOfWeek(day);
    const f = byWeek.get(wk);
    const items = f ? personaliseForecast(f.items, sightings, groupOf) : [];
    const isToday = d === 0;
    const isMonday = day === wk;

    if (isMonday && items.length) {
      const at = day + 7 * 3600_000;
      if (!recent(at)) continue;
      const slides = items.slice(0, 6).map((it, i) => forecastSlide(it, `w${i}`));
      if (wk === week) slides.push(questSlide(thisWeek, 'quests'));
      out.push({
        id: `weekly:${f!.weekOf}`,
        kind: 'weekly',
        at,
        caption: `${f!.headline || 'This week near you'} Here’s what’s happening around the ${regionLabel}.`,
        slides,
      });
      continue;
    }

    const t = byDate.get(day);
    if (!t && !items.length) continue;
    const at = day + 8 * 3600_000;
    if (!recent(at)) continue;
    const slides: Slide[] = [];
    if (t?.facts.length) {
      const photo = t.photo ? { uri: t.photo.url, credit: t.photo.credit } : undefined;
      const i0 = hash(t.date) % t.facts.length;
      slides.push({ key: 'aotd', photo, emoji: '🌟', title: `Animal of the day: ${t.species}`, text: t.facts[i0], tone: 'orange' });
      const second = t.facts[(i0 + 1) % t.facts.length];
      if (t.facts.length > 1) slides.push(factSlide(second, 'aotd2', { title: `More about the ${t.species.toLowerCase()}`, fallbackEmoji: '💡', tone: 'blue' }));
      if (t.tip) slides.push(factSlide(t.tip, 'tip', { title: 'How to spot one', fallbackEmoji: '🔎', tone: 'green' }));
    }
    if (items.length) {
      const dow = Math.round((day - wk) / DAY_MS); // 1..6
      slides.push(forecastSlide(items[(Math.max(dow, 1) - 1) % items.length], 'near'));
    }
    if (isToday && thisWeek.some((c) => !c.done)) slides.push(questSlide(thisWeek, 'quests'));
    if (!slides.length) continue;
    out.push({
      id: `daily:${day}`,
      kind: 'daily',
      at,
      caption: pick(
        ['Today with Scout! Meet today’s animal.', 'New day, new critters 🦊', 'Here’s your animal of the day!', 'Something cool to look for today 👀'],
        `${seed}:${day}`,
      ),
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
        title: n === 1 ? `Your first animal: ${withArticle(name)}!` : `New species: ${name}!`,
        text: s.points ? `+${s.points} points for your journal` : undefined,
        tone: 'orange',
        href: `/sighting/${s.id}`,
      },
    ];
    const notes = s.crew;
    if (notes) {
      notes.facts.slice(0, 3).forEach((fact, i) =>
        slides.push(
          factSlide(fact, `f${i}`, {
            photo: i === 0 && notes.photo ? { uri: notes.photo.url, credit: notes.photo.credit } : undefined,
            title: ['Fun fact', 'Wow!', 'One more thing'][i] ?? 'Fun fact',
            fallbackEmoji: GROUP_EMOJI[g] ?? '💡',
            tone: (['blue', 'green', 'clay'] as Tone[])[i % 3],
          }),
        ),
      );
      if (notes.tip) slides.push(factSlide(notes.tip, 'tip', { title: 'How to spot one', fallbackEmoji: '🔎', tone: 'gold' }));
      for (const o of notes.others.slice(0, 3)) {
        slides.push({ key: `o:${o.postId}`, photo: { uri: o.photoUrl }, title: `${o.name} saw one too`, text: o.likes ? `♥ ${o.likes}` : undefined, href: `/post/${o.postId}` });
      }
    }
    out.push({
      id: `first:${s.id}`,
      kind: 'first_species',
      at,
      caption: n === 1 ? 'Your very first species! 🎉' : `Species #${n} in your journal! 🎉`,
      slides,
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
