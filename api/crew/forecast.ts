import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { askJSON } from '../_lib/claude';
import { regionSpecies, type PhotoRef } from '../_lib/library';
import { libraryPhotos, speciesPhotos } from '../_lib/photos';
import { shorten } from '../_lib/crewFacts';
import { regionByKey, weekOf } from '../../shared/crew';

// GET /api/crew/forecast?region=northeast
// Scout's weekly "what's happening near you" for a region: a handful of
// seasonal stories (one animal each), every one with a short title, three
// simple lines and its own photos, so the app can show one story per post
// with a different photo on every slide. Generated on the first
// request of the week, then cached in crew_forecasts (and in memory) and served
// to everyone in that region. The app personalises the order.

export const config = { maxDuration: 60 };

const GROUPS = ['bird', 'mammal', 'fish', 'reptile', 'amphibian', 'insect', 'other'] as const;

interface ForecastItem {
  group: (typeof GROUPS)[number];
  species: string;
  sci: string;
  emoji: string;
  title: string;
  facts: string[]; // what's happening, where/when to look, a fun fact
  photos: PhotoRef[];
}
interface Forecast {
  region: string;
  weekOf: string;
  headline: string;
  items: ForecastItem[];
}

// 'kid:' versions the cache (forecasts written before the slide format are ignored).
const CACHE_PREFIX = 'kid:';

const SYSTEM =
  'You are Scout, a friendly fox who is the AI guide in ClipIt, a game where people photograph wild animals. ' +
  'For a region and a week of the year, pick animals that are doing something seasonal right now that a casual ' +
  'explorer could actually see: migrations, arrivals and departures, babies and nesting, fish runs, the rut, ' +
  'getting ready for winter, insects on flowers. Only well-documented seasonal patterns for that region. ' +
  'Write for a 12-year-old scrolling a phone: simple everyday words, short and fun. ' +
  'Each item: the animal\'s common and scientific name, a title of at most 32 characters saying what it is up to ' +
  '(like "Trout are laying eggs"), one emoji that fits, and exactly 3 short lines, each ONE sentence of at most 90 ' +
  'characters starting with a fitting emoji and a space: (1) what is happening and why, (2) where and when to look ' +
  'or listen (general habitats like "ponds" or "open fields" only; never nests, dens or roosts), (3) a fun fact ' +
  'about it. ' +
  'Hedge timing ("around now", "often"), never give exact dates or counts, no markdown. ' +
  'Use a different kind of animal for each item when the season allows.';

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          group: { type: 'string', enum: [...GROUPS] },
          species: { type: 'string' },
          sci: { type: 'string' },
          emoji: { type: 'string' },
          title: { type: 'string' },
          facts: { type: 'array', items: { type: 'string' } },
        },
        required: ['group', 'species', 'sci', 'emoji', 'title', 'facts'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'items'],
  additionalProperties: false,
};

const memo = new Map<string, Promise<Forecast>>();

async function build(region: string, week: string): Promise<Forecast> {
  const db = adminClient();
  if (db) {
    const { data } = await db.from('crew_forecasts').select('payload').eq('region', CACHE_PREFIX + region).eq('week_of', week).maybeSingle();
    if (data?.payload) return data.payload as Forecast;
  }
  const r = regionByKey(region)!;
  const when = new Date(`${week}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const out = await askJSON<{ headline: string; items: ForecastItem[] }>({
    system: SYSTEM,
    prompt:
      `Region: ${r.describe}. The week starting Monday ${when}. Give a headline of at most 40 characters and 6 items. ` +
      `We have photos of these animals, so prefer them whenever they really fit the season and region (use the exact ` +
      `name): ${regionSpecies(region).join(', ')}. Other animals are fine when they are the better story (like a fish run).`,
    schema: SCHEMA,
  });
  const forecast: Forecast = {
    region,
    weekOf: week,
    headline: shorten(String(out.headline ?? ''), 60),
    items: (out.items ?? []).slice(0, 6).map((it) => ({
      group: GROUPS.includes(it.group) ? it.group : 'other',
      species: String(it.species ?? '').trim(),
      sci: String(it.sci ?? '').trim(),
      emoji: String(it.emoji ?? '').trim().slice(0, 8),
      title: shorten(String(it.title ?? ''), 48),
      facts: (it.facts ?? []).map((f) => shorten(String(f))).filter(Boolean).slice(0, 3),
      photos: [],
    })),
  };
  // Photos one species at a time (gentle on Wikimedia), within the time budget.
  const deadline = Date.now() + 25_000;
  for (const it of forecast.items) {
    it.photos = Date.now() < deadline ? await speciesPhotos(it.species, it.sci || null, 4) : libraryPhotos(it.species, it.sci).slice(0, 4);
  }
  if (!forecast.items.length) throw new Error('no forecast items returned');
  if (db) {
    const { error } = await db.from('crew_forecasts').upsert({ region: CACHE_PREFIX + region, week_of: week, payload: forecast });
    if (error) log('crew_forecast_cache_error', { detail: error.message });
  }
  log('crew_forecast_generated', { region, week });
  return forecast;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('crew_forecast_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`forecast:${userId}`, 20)) return res.status(429).json({ error: 'too many requests' });

  const region = String(req.query.region ?? '');
  if (!regionByKey(region)) return res.status(400).json({ error: 'unknown region' });
  const week = weekOf();
  const key = `${region}:${week}`;
  if (!memo.has(key)) memo.set(key, build(region, week).catch((e) => { memo.delete(key); throw e; }));
  try {
    const forecast = await memo.get(key)!;
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(forecast);
  } catch (err: any) {
    fail('generate_error', { region, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(502).json({ error: 'forecast unavailable' });
  }
}
