// Scout's stories: tap a post to go deeper, one page at a time (like
// Instagram stories). Written once per theme (region + week) or per species
// (per month, so it can talk about what the animal is up to right now), then
// cached in crew_stories and served to everyone.
import type { SupabaseClient } from '@supabase/supabase-js';
import { askJSON } from './claude';
import { getSpeciesPhotos, shorten } from './crewFacts';
import type { PhotoRef } from './library';
import { withoutBlocked } from './photoFlags';
import { log } from './server';
import { regionByKey } from '../../shared/crew';

export interface StoryPage {
  heading: string;
  emoji: string;
  text: string;
  photo?: PhotoRef | null;
}
export interface Story {
  key: string;
  kind: 'theme' | 'species';
  title: string;
  species: string;
  pages: StoryPage[];
}
export interface StoryRequest {
  kind: 'theme' | 'species';
  species: string;
  sci?: string | null;
  title?: string | null; // theme title, e.g. "Deer are in the rut"
  region?: string | null;
  weekOf?: string | null; // theme week (YYYY-MM-DD, Monday)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function storyKey(r: StoryRequest, now = new Date()): string {
  return r.kind === 'theme'
    ? `theme:v1:${r.region}:${r.weekOf}:${slug(r.species)}:${slug(r.title ?? '')}`
    : `species:v1:${slug(r.sci || r.species)}:${now.getUTCMonth() + 1}`;
}

const SYSTEM =
  'You are Scout, a friendly fox who is the AI field guide in ClipIt, a wildlife photography game for ages 13 and up. ' +
  'Write a short story-style explainer, in pages a 12-year-old would love to tap through. Rules: only facts that are ' +
  'accurate and widely documented in field guides and encyclopedias; hedge timing ("usually", "often", "around now"); ' +
  'no exact numbers unless they are textbook-standard; never name private or sensitive sites (nests, dens, roosts); ' +
  'remind people to watch from a distance where it matters. Each page: a heading of at most 40 characters, one ' +
  'fitting emoji, and a text of 1 to 3 short sentences (at most 230 characters) in simple everyday words. Vary the ' +
  'sentence openings. No markdown, no lists, no "Did you know".';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: { heading: { type: 'string' }, emoji: { type: 'string' }, text: { type: 'string' } },
        required: ['heading', 'emoji', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'pages'],
  additionalProperties: false,
};

function prompt(r: StoryRequest, now: Date): string {
  const name = `${r.species}${r.sci ? ` (${r.sci})` : ''}`;
  const where = regionByKey(r.region ?? '')?.describe ?? 'North America';
  if (r.kind === 'theme') {
    const when = r.weekOf ? new Date(`${r.weekOf}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : MONTHS[now.getUTCMonth()];
    return (
      `Topic: "${r.title}" (${name}), in ${where}, the week of ${when}. Write 6 pages, in this order: ` +
      `1) what is happening right now (a fun hook); 2) why they do it; 3) when it happens (season, time of day, how ` +
      `long it lasts); 4) where to look and what you might see or hear; 5) a wow fact about it; 6) how to be a good ` +
      `explorer around it, ending with a small mission for the reader. Title: at most 40 characters.`
    );
  }
  return (
    `Animal: ${name}. It is ${MONTHS[now.getUTCMonth()]} in ${where}. Write 6 pages, in this order: 1) meet the ` +
    `animal (looks and personality); 2) what it eats and how it finds food; 3) what it is usually up to in ` +
    `${MONTHS[now.getUTCMonth()]}; 4) its superpower; 5) family life and babies; 6) how to spot one (where, when, ` +
    `signs, sounds), ending with a small mission for the reader. Title: at most 40 characters.`
  );
}

const memo = new Map<string, Promise<Story>>();

async function generate(db: SupabaseClient | null, r: StoryRequest, key: string): Promise<Story> {
  if (db) {
    const { data, error } = await db.from('crew_stories').select('payload').eq('key', key).maybeSingle();
    if (error) log('crew_story_cache_error', { detail: error.message });
    if (data?.payload) return data.payload as Story;
  }
  const now = new Date();
  const [out, photos] = await Promise.all([
    askJSON<{ title: string; pages: StoryPage[] }>({ system: SYSTEM, prompt: prompt(r, now), schema: SCHEMA, maxTokens: 6000 }),
    getSpeciesPhotos(db, r.species, r.sci).catch(() => [] as PhotoRef[]),
  ]);
  const pages: StoryPage[] = (out.pages ?? [])
    .slice(0, 7)
    .map((p) => ({ heading: shorten(String(p.heading ?? ''), 48), emoji: String(p.emoji ?? '').trim().slice(0, 8), text: shorten(String(p.text ?? ''), 260) }))
    .filter((p) => p.text);
  if (pages.length < 3) throw new Error('story too short');
  // Photos on the first pages and spread out after that; emoji pages between.
  const n = Math.min(photos.length, pages.length);
  for (let k = 0; k < n; k++) pages[Math.round((k * pages.length) / n)].photo = photos[k];
  const story: Story = { key, kind: r.kind, title: shorten(String(out.title ?? r.title ?? r.species), 48), species: r.species, pages };
  if (db) {
    const { error } = await db.from('crew_stories').upsert({ key, payload: story });
    if (error) log('crew_story_cache_error', { detail: error.message });
  }
  log('crew_story_generated', { key });
  return story;
}

export async function getStory(db: SupabaseClient | null, r: StoryRequest): Promise<Story> {
  const key = storyKey(r);
  if (!memo.has(key)) {
    memo.set(key, generate(db, r, key).catch((e) => { memo.delete(key); throw e; }));
    setTimeout(() => memo.delete(key), 30 * 60_000).unref?.();
  }
  const story = await memo.get(key)!;
  // Reported photos disappear even from stories written before the report.
  const keep = await withoutBlocked(db, story.pages.map((p) => p.photo).filter(Boolean) as PhotoRef[]);
  const ok = new Set(keep.map((p) => p.url));
  return { ...story, pages: story.pages.map((p) => (p.photo && !ok.has(p.photo.url) ? { ...p, photo: null } : p)) };
}

export async function hasStory(db: SupabaseClient, r: StoryRequest): Promise<boolean> {
  const { data } = await db.from('crew_stories').select('key').eq('key', storyKey(r)).maybeSingle();
  return Boolean(data);
}

// Write upcoming stories ahead of time (daily job), so taps open instantly:
// this week's themes for every region with a forecast, and today's and
// tomorrow's animal of the day there. Returns the keys written (or that
// would be, with `dry`).
export async function prewarmStories(
  db: SupabaseClient,
  opts: { dry?: boolean; cap?: number; deadline?: number; week: string; dailyPick: (region: string, date: string) => { species: string; sci: string } },
): Promise<string[]> {
  const { data: rows } = await db.from('crew_forecasts').select('region, payload').eq('week_of', opts.week).like('region', 'kid:%');
  const wanted: StoryRequest[] = [];
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  for (const row of rows ?? []) {
    const region = String(row.region).slice(4);
    for (const it of (row.payload as any)?.items ?? []) {
      wanted.push({ kind: 'theme', region, weekOf: opts.week, species: it.species, sci: it.sci || null, title: it.title });
    }
    for (const d of [day(0), day(1)]) {
      const pick = opts.dailyPick(region, d);
      wanted.push({ kind: 'species', region, species: pick.species, sci: pick.sci });
    }
  }
  const seen = new Set<string>();
  const todo: StoryRequest[] = [];
  for (const r of wanted) {
    const key = storyKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(await hasStory(db, r))) todo.push(r);
    if (todo.length >= (opts.cap ?? 6)) break;
  }
  if (opts.dry) return todo.map((r) => storyKey(r));
  const done: string[] = [];
  const queue = [...todo];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      if (opts.deadline && Date.now() > opts.deadline) return;
      try {
        await getStory(db, r);
        done.push(storyKey(r));
      } catch (err: any) {
        log('crew_story_prewarm_error', { key: storyKey(r), detail: String(err?.message ?? err).slice(0, 160) });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return done;
}
