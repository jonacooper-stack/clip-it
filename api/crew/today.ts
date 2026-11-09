import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { getFacts } from '../_lib/crewFacts';
import { dailyPick, toRef } from '../_lib/library';
import { regionByKey } from '../../shared/crew';

// GET /api/crew/today?region=northeast&date=2026-11-12
// Scout's "animal of the day" for a region: a credited library photo
// (suited to the region, cycling so nothing repeats for months) plus facts
// (cached per species). `date` is the player's local date.

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('crew_today_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`today:${userId}`, 30)) return res.status(429).json({ error: 'too many requests' });

  const region = String(req.query.region ?? '');
  const date = String(req.query.date ?? '');
  if (!regionByKey(region)) return res.status(400).json({ error: 'unknown region' });
  // Local dates are within a day of UTC; reject anything else.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Math.abs(Date.parse(`${date}T12:00:00Z`) - Date.now()) > 2 * 86_400_000) {
    return res.status(400).json({ error: 'bad date' });
  }

  const pick = dailyPick(region, date);
  try {
    const facts = await getFacts(adminClient(), pick.species, pick.sci);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json({ region, date, species: pick.species, sci: pick.sci, photo: toRef(pick), facts: facts.facts, tip: facts.tip });
  } catch (err: any) {
    fail('facts_error', { species: pick.species, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(502).json({ error: 'species of the day unavailable' });
  }
}
