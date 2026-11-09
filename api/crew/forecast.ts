import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { askJSON } from '../_lib/claude';
import { findLibraryPhoto, regionSpecies, type PhotoRef } from '../_lib/library';
import { shorten } from '../_lib/crewFacts';
import { regionByKey, weekOf } from '../../shared/crew';

// GET /api/crew/forecast?region=northeast
// Scout's weekly "what's happening near you" for a region: one slide per
// animal (a photo, a short title and one simple fact). Generated on the first
// request of the week, then cached in crew_forecasts (and in memory) and served
// to everyone in that region. The app personalises the order.

export const config = { maxDuration: 60 };

const GROUPS = ['bird', 'mammal', 'fish', 'reptile', 'amphibian', 'insect', 'other'] as const;

interface ForecastItem {
  group: (typeof GROUPS)[number];
  species: string;
  emoji: string;
  title: string;
  fact: string;
  photo?: PhotoRef | null;
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
  'Each item: a title of at most 32 characters saying what the animal is up to (like "Trout are laying eggs"), ' +
  'one emoji that fits, and ONE fact sentence of at most 90 characters that says what to look for or where ' +
  '(general habitats like "ponds" or "open fields" only; never nests, dens or roosts). ' +
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
          emoji: { type: 'string' },
          title: { type: 'string' },
          fact: { type: 'string' },
        },
        required: ['group', 'species', 'emoji', 'title', 'fact'],
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
    items: (out.items ?? []).slice(0, 6).map((it, i) => ({
      group: GROUPS.includes(it.group) ? it.group : 'other',
      species: String(it.species ?? '').trim(),
      emoji: String(it.emoji ?? '').trim().slice(0, 8),
      title: shorten(String(it.title ?? ''), 48),
      fact: shorten(String(it.fact ?? '')),
      photo: findLibraryPhoto(String(it.species ?? ''), null, i),
    })),
  };
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
