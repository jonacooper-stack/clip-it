import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { getStory, type StoryRequest } from '../_lib/stories';
import { regionByKey } from '../../shared/crew';

// POST /api/crew/story  { kind: 'theme' | 'species', species, sci?, title?, region?, weekOf? }
// Scout's deeper story behind a post: 6 short pages with photos. Written
// once (per theme and week, or per species and month) and cached.

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('crew_story_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`story:${userId}`, 30)) return res.status(429).json({ error: 'too many requests' });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const kind = b.kind === 'theme' ? 'theme' : 'species';
  const species = str(b.species, 80);
  if (!species) return res.status(400).json({ error: 'species is required' });
  const r: StoryRequest = { kind, species, sci: str(b.sci, 80), title: str(b.title, 80), region: str(b.region, 40), weekOf: str(b.weekOf, 10) };
  if (r.region && !regionByKey(r.region)) r.region = null;
  if (kind === 'theme') {
    // A theme story belongs to one region's week; keep the key space small.
    const week = r.weekOf && /^\d{4}-\d{2}-\d{2}$/.test(r.weekOf) ? Date.parse(`${r.weekOf}T12:00:00Z`) : NaN;
    if (!r.title || !r.region || !Number.isFinite(week) || Math.abs(week - Date.now()) > 21 * 86_400_000) {
      return res.status(400).json({ error: 'theme stories need title, region and a recent weekOf' });
    }
  }
  try {
    const story = await getStory(adminClient(), r);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(story);
  } catch (err: any) {
    fail('generate_error', { kind, species, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(502).json({ error: 'story unavailable' });
  }
}
