import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, dailyLimitReached, log, rateLimited, verifyUser } from '../_lib/server';
import { getStory, type StoryRequest } from '../_lib/stories';
import { findTheme } from '../_lib/forecasts';
import { NotAnAnimal, QuotaExceeded } from '../_lib/crewFacts';
import { regionByKey } from '../../shared/crew';
import { cleanName, hasBlockedLanguage } from '../../shared/moderation';

// A theme title as Scout writes them: a few plain words.
const TITLE = /^[\p{L}\p{M}\p{N} ,.'’!?\-]{3,48}$/u;

// POST /api/crew/story  { kind: 'theme' | 'species', species, sci?, title?, region?, weekOf? }
// Scout's deeper story behind a post: 6 short pages with photos. Written
// once (per theme and week, or per species and month) and cached.
//
// What may be asked for is limited, because a new story costs AI credit and is
// then shown to everyone:
//   - a theme story only for a theme Scout really posted in that region's week
//     (the species and title must match the forecast);
//   - a species story only for something that reads like an animal's name
//     (the model also refuses names that aren't animals);
//   - each player can cause only so many new stories a day.

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
  let request: StoryRequest;

  if (kind === 'theme') {
    const region = str(b.region, 40);
    const weekOf = str(b.weekOf, 10);
    const species = str(b.species, 80);
    const title = str(b.title, 80);
    const week = weekOf && /^\d{4}-\d{2}-\d{2}$/.test(weekOf) ? Date.parse(`${weekOf}T12:00:00Z`) : NaN;
    if (!species || !title || !region || !regionByKey(region) || !Number.isFinite(week) || Math.abs(week - Date.now()) > 21 * 86_400_000) {
      return res.status(400).json({ error: 'theme stories need title, region and a recent weekOf' });
    }
    // Use the forecast's own wording, not the request's.
    const theme = await findTheme(region, weekOf!, species, title);
    if (theme) {
      request = { kind, region, weekOf, species: theme.species, sci: theme.sci || null, title: theme.title };
    } else if (!adminClient() && cleanName(species) && TITLE.test(title) && !hasBlockedLanguage(title)) {
      // No database to check the theme against (a deployment without the
      // service key keeps forecasts in memory only): accept a plain-looking one.
      request = { kind, region, weekOf, species: cleanName(species)!, sci: cleanName(b.sci, 80), title };
    } else {
      return res.status(404).json({ error: 'no such theme this week' });
    }
  } else {
    const species = cleanName(b.species);
    if (!species) return res.status(400).json({ error: 'species is required' });
    request = { kind, species, sci: cleanName(b.sci, 80) };
  }

  const db = adminClient();
  try {
    const story = await getStory(db, request, { allow: async () => !(await dailyLimitReached(db, userId, 'generate')) });
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(story);
  } catch (err: any) {
    if (err instanceof QuotaExceeded) return res.status(429).json({ error: 'daily limit reached' });
    if (err instanceof NotAnAnimal) return res.status(404).json({ error: 'no story for that' });
    fail('generate_error', { kind, species: request.species, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(502).json({ error: 'story unavailable' });
  }
}
