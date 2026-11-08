import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { askJSON } from '../_lib/claude';
import { findLibraryPhoto, type PhotoRef } from '../_lib/library';
import { regionByKey, weekOf } from '../../shared/crew';

// GET /api/crew/forecast?region=northeast
// Scout's weekly "what's out there now" for a region: generated on the first
// request of the week, then cached in crew_forecasts (and in memory) and served
// to everyone in that region. The app personalises the order.

export const config = { maxDuration: 60 };

const GROUPS = ['bird', 'mammal', 'fish', 'reptile', 'amphibian', 'insect', 'other'] as const;

interface ForecastItem {
  group: (typeof GROUPS)[number];
  species: string;
  title: string;
  body: string;
  where: string;
  photo?: PhotoRef | null;
}
interface Forecast {
  region: string;
  weekOf: string;
  headline: string;
  items: ForecastItem[];
}

const SYSTEM =
  'You are Scout, the seasonal wildlife guide in ClipIt, a game where people photograph wild animals. ' +
  'For a region and a week of the year, list wildlife events that typically happen then and that a casual ' +
  'explorer could actually see: migrations, arrivals and departures, breeding and nesting, spawning runs, the rut, ' +
  'hibernation prep, insects and the plants they visit. Only well-documented seasonal patterns for that region. ' +
  'Hedge the timing ("around now", "often", "look for"), never give exact dates or counts, never name private or ' +
  'sensitive sites (nests, dens, roosts); general habitats like "beaches", "ridgelines" or "clear riffles" are good. ' +
  'Spread items across different animal groups when the season allows. Titles under 60 characters, bodies under ' +
  '220 characters, warm and specific, no emoji, no markdown. Where it fits, remind people to watch from a distance.';

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
          title: { type: 'string' },
          body: { type: 'string' },
          where: { type: 'string' },
        },
        required: ['group', 'species', 'title', 'body', 'where'],
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
    const { data } = await db.from('crew_forecasts').select('payload').eq('region', region).eq('week_of', week).maybeSingle();
    if (data?.payload) return data.payload as Forecast;
  }
  const r = regionByKey(region)!;
  const when = new Date(`${week}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const out = await askJSON<{ headline: string; items: ForecastItem[] }>({
    system: SYSTEM,
    prompt: `Region: ${r.describe}. The week starting Monday ${when}. Give a headline under 80 characters and 5 items.`,
    schema: SCHEMA,
  });
  const forecast: Forecast = {
    region,
    weekOf: week,
    headline: String(out.headline ?? '').trim(),
    items: (out.items ?? []).slice(0, 6).map((it, i) => ({
      group: GROUPS.includes(it.group) ? it.group : 'other',
      species: String(it.species ?? '').trim(),
      title: String(it.title ?? '').trim(),
      body: String(it.body ?? '').trim(),
      where: String(it.where ?? '').trim(),
      photo: findLibraryPhoto(String(it.species ?? ''), null, i),
    })),
  };
  if (!forecast.items.length) throw new Error('no forecast items returned');
  if (db) {
    const { error } = await db.from('crew_forecasts').upsert({ region, week_of: week, payload: forecast });
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
