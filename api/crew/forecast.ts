import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { getForecast } from '../_lib/forecasts';
import { withoutBlocked } from '../_lib/photoFlags';
import { regionByKey, weekOf } from '../../shared/crew';

// GET /api/crew/forecast?region=northeast
// Scout's weekly "what's happening near you" for a region (see
// _lib/forecasts.ts). One per region per week, shared by everyone there.

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('crew_forecast_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`forecast:${userId}`, 20)) return res.status(429).json({ error: 'too many requests' });

  const region = String(req.query.region ?? '');
  if (!regionByKey(region)) return res.status(400).json({ error: 'unknown region' });
  try {
    const forecast = await getForecast(region, weekOf());
    const db = adminClient();
    const items = await Promise.all(forecast.items.map(async (it) => ({ ...it, photos: await withoutBlocked(db, it.photos) })));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json({ ...forecast, items });
  } catch (err: any) {
    fail('generate_error', { region, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(502).json({ error: 'forecast unavailable' });
  }
}
