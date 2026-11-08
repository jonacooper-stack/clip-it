// The Field Crew inbox: everything the crew has to say to this player, built
// from the journal, this week's challenges and duel, and Scout's forecast.
// Nothing here is stored; it's recomputed, so it's always in sync.
import type { CrewOtherPost, Sighting } from '@/types';
import type { Forecast, ForecastItem } from '@/state/useCrewStore';
import { regionByKey, withArticle, type CrewKey, type RegionKey } from '../../../shared/crew';
import { challengeStatus, SWEEP_BONUS, type ChallengeStatus, type GroupOf } from './challenges';
import { DUEL_WIN_BONUS, duelState, type DuelState } from './duel';
import { addWeeks, DAY_MS, hash, startOfWeek } from './time';

export type InboxKind =
  | 'intro'
  | 'region'
  | 'forecast'
  | 'challenges'
  | 'challenge_done'
  | 'duel'
  | 'duel_result'
  | 'milestone'
  | 'hoot'
  | 'magpie';

export interface InboxItem {
  id: string;
  crew: CrewKey;
  kind: InboxKind;
  at: number;
  title: string;
  body?: string;
  href?: string;
  cta?: string;
  photoUri?: string;
  photoCredit?: string;
  forecast?: { intro: string; items: ForecastItem[] };
  challenges?: ChallengeStatus[];
  duel?: DuelState;
  others?: CrewOtherPost[];
}

const COUNTED = (s: Sighting) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible' && typeof s.points === 'number';
const pick = <T,>(xs: T[], seed: string) => xs[hash(seed) % xs.length];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const GROUP_NAMES: Record<string, string> = { bird: 'birds', mammal: 'mammals', fish: 'fish', reptile: 'reptiles', amphibian: 'amphibians', insect: 'insects' };

// Order Scout's items by what this player logs most, and say so.
export function personaliseForecast(f: Forecast, sightings: Sighting[], groupOf: GroupOf, region: RegionKey) {
  const counts = new Map<string, number>();
  for (const s of sightings.filter(COUNTED)) {
    const g = groupOf(s);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const items = [...f.items].sort((a, b) => (counts.get(b.group) ?? 0) - (counts.get(a.group) ?? 0));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const where = regionByKey(region)?.label ?? 'your area';
  const intro =
    top && top[1] >= 3 && GROUP_NAMES[top[0]] && items[0]?.group === top[0]
      ? `You’ve been logging a lot of ${GROUP_NAMES[top[0]]}, so those come first. Here’s what’s happening around the ${where} this week.`
      : `Here’s what’s happening around the ${where} this week. Keep your distance and let them be.`;
  return { intro, items };
}

export function buildInbox(opts: {
  sightings: Sighting[];
  now?: number;
  region: RegionKey | null;
  forecast: Forecast | null;
  seed: string;
  groupOf: GroupOf;
}): InboxItem[] {
  const now = opts.now ?? Date.now();
  const { sightings, seed, groupOf } = opts;
  const week = startOfWeek(now);
  const clamp = (t: number) => Math.min(t, now);
  const items: InboxItem[] = [];
  const counted = sightings.filter(COUNTED).sort((a, b) => a.observedAt - b.observedAt);

  // Intro (always at the bottom)
  items.push({
    id: 'intro',
    crew: 'moss',
    kind: 'intro',
    at: 0,
    title: 'Meet your Field Crew',
    body: 'We’re five friendly bots here to make your sightings more fun: Dr. Hoot brings the facts, Scout knows what’s out there this week, I set your challenges, Magpie collects the best finds, and Kestrel… wants to beat you. Slow and steady!',
  });

  // Scout
  if (!opts.region) {
    items.push({
      id: `region:${week}`,
      crew: 'scout',
      kind: 'region',
      at: clamp(week + 7 * 3600_000),
      title: 'Where do you explore?',
      body: 'Tell me your home region and every Monday I’ll send you what’s migrating, nesting and spawning near you.',
      href: '/region',
      cta: 'Pick my region',
    });
  } else if (opts.forecast && opts.forecast.weekOf) {
    const p = personaliseForecast(opts.forecast, sightings, groupOf, opts.region);
    items.push({
      id: `forecast:${opts.region}:${opts.forecast.weekOf}`,
      crew: 'scout',
      kind: 'forecast',
      at: clamp(week + 7 * 3600_000),
      title: opts.forecast.headline || 'This week’s forecast',
      forecast: p,
    });
  }

  // Moss: this week's challenges, completions, milestones
  const status = challengeStatus(week, sightings, seed, groupOf);
  const doneCount = status.filter((c) => c.done).length;
  items.push({
    id: `challenges:${week}`,
    crew: 'moss',
    kind: 'challenges',
    at: clamp(week + 6 * 3600_000),
    title: doneCount === 3 ? 'All three done. Wonderful!' : 'This week’s challenges',
    body:
      doneCount === 3
        ? `You swept the week: +${SWEEP_BONUS} bonus points. Rest those legs.`
        : pick(['New week, three challenges. No rush; every sighting counts.', 'Here’s this week’s trail. Take it one critter at a time.', 'Three little goals for the week. You’ve got this.'], `${seed}:${week}:moss`),
    challenges: status,
  });
  for (const c of status) {
    if (!c.done || !c.doneAt) continue;
    items.push({ id: `challenge_done:${week}:${c.def.id}`, crew: 'moss', kind: 'challenge_done', at: c.doneAt + 1000, title: `Challenge complete: ${c.def.title}`, body: `+${c.def.reward} points. ${pick(['Lovely work.', 'Steady wins it.', 'That’s the spirit.'], c.def.id + week)}` });
  }
  const speciesSeen = new Set<string>();
  const speciesMilestones = new Set([1, 5, 10, 25, 50, 100, 200]);
  const sightingMilestones = new Set([10, 25, 50, 100, 250]);
  counted.forEach((s, i) => {
    const name = s.species?.scientificName || s.species?.commonName;
    if (name && !speciesSeen.has(name)) {
      speciesSeen.add(name);
      const n = speciesSeen.size;
      if (speciesMilestones.has(n) && now - s.observedAt < 60 * DAY_MS) {
        items.push({ id: `ms:species:${n}`, crew: 'moss', kind: 'milestone', at: s.observedAt + 2000, title: n === 1 ? 'Your very first species!' : `${n} species!`, body: n === 1 ? `${withArticle(s.species?.commonName ?? 'wild animal').replace(/^a/, 'A')} to start your journal. The first of many.` : `Your journal now holds ${n} different species. Look how far you’ve come.` });
      }
    }
    if (sightingMilestones.has(i + 1) && now - s.observedAt < 60 * DAY_MS) {
      items.push({ id: `ms:sightings:${i + 1}`, crew: 'moss', kind: 'milestone', at: s.observedAt + 3000, title: `${i + 1} sightings logged`, body: 'Every one of them a moment outside. Keep going.' });
    }
  });

  // Kestrel: this week's duel and last week's result
  const duel = duelState(sightings, week, seed, now);
  const lead = duel.you - duel.kestrel;
  items.push({
    id: `duel:${week}`,
    crew: 'kestrel',
    kind: 'duel',
    at: clamp(week + 8 * 3600_000),
    title: lead > 0 ? `You’re up ${duel.you}–${duel.kestrel}` : lead < 0 ? `I’m ahead ${duel.kestrel}–${duel.you}` : `Dead even at ${duel.you}`,
    body:
      lead > 0
        ? pick(['Enjoy it while it lasts.', 'Lucky week. I’m just warming up.', 'Don’t get comfortable.'], `${seed}:${week}:k+`)
        : lead < 0
          ? `${plural(duel.daysLeft, 'day')} left to catch me. Most points by Sunday night wins (+${DUEL_WIN_BONUS}).`
          : 'Your move. Most points by Sunday night wins.',
    duel,
  });
  const last = addWeeks(week, -1);
  if (counted.some((s) => s.observedAt >= last && s.observedAt < week)) {
    const r = duelState(sightings, last, seed, now);
    items.push({
      id: `duel_result:${last}`,
      crew: 'kestrel',
      kind: 'duel_result',
      at: clamp(week + 5 * 3600_000),
      title: r.youWon ? `You beat me ${r.you}–${r.target}` : `I won last week ${r.target}–${r.you}`,
      body: r.youWon ? `Fine. FINE. +${DUEL_WIN_BONUS} points for you. Rematch starts now.` : 'Shake it off. New week, new duel.',
      duel: r,
    });
  }

  // Dr. Hoot (first time you log a species) and Magpie (others who saw it)
  const firstOf = new Set<string>();
  for (const s of counted) {
    const name = s.species?.commonName;
    if (!name || !s.crew || now - s.observedAt > 60 * DAY_MS) continue;
    if (!firstOf.has(name) && s.crew.facts.length) {
      firstOf.add(name);
      items.push({ id: `hoot:${s.id}`, crew: 'hoot', kind: 'hoot', at: s.observedAt + 4000, title: `Hoo! Your first ${name}!`, body: s.crew.facts[0], href: `/sighting/${s.id}`, cta: 'See all my notes' });
    }
    if (s.crew.others.length) {
      const n = s.crew.others.length;
      items.push({ id: `magpie:${s.id}`, crew: 'magpie', kind: 'magpie', at: s.observedAt + 5000, title: `${n === 1 ? 'Another explorer' : `${n} other explorers`} spotted ${withArticle(name)}`, body: 'I added theirs to my collection. Have a look and compare!', others: s.crew.others, href: `/sighting/${s.id}` });
    } else if (s.crew.photo && !firstOf.has(`magpie:${name}`)) {
      firstOf.add(`magpie:${name}`);
      items.push({ id: `magpie:${s.id}`, crew: 'magpie', kind: 'magpie', at: s.observedAt + 5000, title: `From my collection: ${withArticle(name)}`, body: 'Nobody else has posted one yet. Share yours to be the first!', photoUri: s.crew.photo.url, photoCredit: s.crew.photo.credit, href: `/sighting/${s.id}` });
    }
  }

  return items.sort((a, b) => b.at - a.at);
}

export function unreadCount(items: InboxItem[], seenAt: number): number {
  return items.filter((i) => i.at > seenAt && i.kind !== 'intro').length;
}
