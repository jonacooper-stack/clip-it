// Scout's weekly "what's happening near you" for a region: a handful of
// seasonal stories (one animal each), every one with a short title, three
// simple lines and its own photos, so the app can show one story per post
// with a different photo on every slide. Generated on the first request of the
// week, then cached in crew_forecasts (and in memory) and served to everyone
// in that region. The app personalises the order.
import { adminClient, log } from './server';
import { askJSON } from './claude';
import { regionSpecies, type PhotoRef } from './library';
import { libraryPhotos } from './photos';
import { getSpeciesPhotos, shorten } from './crewFacts';
import { regionByKey } from '../../shared/crew';

const GROUPS = ['bird', 'mammal', 'fish', 'reptile', 'amphibian', 'insect', 'other'] as const;

export interface ForecastItem {
  group: (typeof GROUPS)[number];
  species: string;
  sci: string;
  emoji: string;
  title: string;
  facts: string[]; // what's happening, where/when to look, a fun fact
  photos: PhotoRef[];
}
export interface Forecast {
  region: string;
  weekOf: string;
  headline: string;
  items: ForecastItem[];
  photosV?: number; // 2 = photos checked by the vision pass
}

// Photos for each theme, from the per-species cache (checked once per
// species), a few at a time, within a time budget.
async function addPhotos(db: ReturnType<typeof adminClient>, forecast: Forecast): Promise<void> {
  const deadline = Date.now() + 30_000;
  const queue = [...forecast.items];
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const item = it;
      try {
        item.photos = Date.now() < deadline ? (await getSpeciesPhotos(db, item.species, item.sci || null)).slice(0, 4) : libraryPhotos(item.species, item.sci).slice(0, 4);
      } catch {
        item.photos = libraryPhotos(item.species, item.sci).slice(0, 4);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  forecast.photosV = 2;
}

// 'kid:' versions the cache (forecasts written before the slide format are ignored).
export const FORECAST_CACHE_PREFIX = 'kid:';

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
    const { data } = await db.from('crew_forecasts').select('payload').eq('region', FORECAST_CACHE_PREFIX + region).eq('week_of', week).maybeSingle();
    if (data?.payload) {
      const cached = data.payload as Forecast;
      if (cached.photosV !== 2) {
        // Cached before photos were checked: redo them once.
        await addPhotos(db, cached);
        const { error } = await db.from('crew_forecasts').upsert({ region: FORECAST_CACHE_PREFIX + region, week_of: week, payload: cached });
        if (error) log('crew_forecast_cache_error', { detail: error.message });
      }
      return cached;
    }
  }
  const r = regionByKey(region)!;
  const when = new Date(`${week}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const out = await askJSON<{ headline: string; items: ForecastItem[] }>({
    job: 'forecast',
    system: SYSTEM,
    prompt:
      `Region: ${r.describe}. The week starting Monday ${when}. Give a headline of at most 40 characters and 6 items. ` +
      `We have photos of these animals, so prefer them whenever they really fit the season and region (use the exact ` +
      `name): ${regionSpecies(region).join(', ')}. Other animals are fine when they are the better story (like a fish run).`,
    schema: SCHEMA,
    maxTokens: 6000,
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
  if (!forecast.items.length) throw new Error('no forecast items returned');
  await addPhotos(db, forecast);
  if (db) {
    const { error } = await db.from('crew_forecasts').upsert({ region: FORECAST_CACHE_PREFIX + region, week_of: week, payload: forecast });
    if (error) log('crew_forecast_cache_error', { detail: error.message });
  }
  log('crew_forecast_generated', { region, week });
  return forecast;
}

// This week's forecast for a region (one model call per region per week,
// however many players ask at once).
export function getForecast(region: string, week: string): Promise<Forecast> {
  const key = `${region}:${week}`;
  if (!memo.has(key)) memo.set(key, build(region, week).catch((e) => { memo.delete(key); throw e; }));
  return memo.get(key)!;
}

const same = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// The theme in a region's forecast that a story request refers to, or null.
// Theme stories are only ever written for themes Scout actually posted: the
// app sends the species and title back, and they must match one. Never
// generates a forecast (a week nobody has opened has no themes to match).
export async function findTheme(region: string, week: string, species: string, title: string): Promise<ForecastItem | null> {
  let forecast: Forecast | null = null;
  const pending = memo.get(`${region}:${week}`);
  if (pending) forecast = await pending.catch(() => null);
  if (!forecast) {
    const db = adminClient();
    if (db) {
      const { data } = await db.from('crew_forecasts').select('payload').eq('region', FORECAST_CACHE_PREFIX + region).eq('week_of', week).maybeSingle();
      forecast = (data?.payload as Forecast | undefined) ?? null;
    }
  }
  return forecast?.items.find((it) => same(it.species, species) && same(it.title, title)) ?? null;
}
