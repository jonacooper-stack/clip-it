import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, dailyLimitReached, log, rateLimited, SITE_URL, verifyUser } from '../_lib/server';
import { photoKey } from '../_lib/photoFlags';

// POST /api/crew/flag-photo  { url, species?, context?, reason? }
// A player says a photo in Scout's posts is wrong (not that animal, not a
// real photo of it, or not right for ClipIt). One report hides it everywhere;
// reports are kept in crew_photo_flags for review.

const REASONS = new Set(['wrong_animal', 'not_a_photo_of_it', 'inappropriate', 'other']);

// Only photos Scout can actually show may be reported: our own library and
// Wikimedia Commons. (Anything else would just fill the table.)
function reportable(url: string): boolean {
  return url.startsWith(`${SITE_URL}/img/library/`) || /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('photo_flag_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`flag:${userId}`, 20)) return res.status(429).json({ error: 'too many requests' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const url = typeof body.url === 'string' ? body.url.trim().slice(0, 600) : '';
  if (!reportable(url)) return res.status(400).json({ error: 'url is required' });
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : null);
  const reason = REASONS.has(String(body.reason)) ? String(body.reason) : 'other';
  const row = { photo_key: photoKey(url), url, species: str(body.species, 80), context: str(body.context, 160), reason, reporter_id: userId };

  const db = adminClient();
  if (!db) return res.status(200).json({ ok: true, stored: false });
  // One report hides a photo for everyone, so a single account can't be
  // allowed to report without limit.
  if (await dailyLimitReached(db, userId, 'flag')) {
    fail('daily_limit', { userId });
    return res.status(429).json({ error: 'daily limit reached' });
  }
  const { error } = await db.from('crew_photo_flags').upsert(row, { onConflict: 'photo_key,reporter_id', ignoreDuplicates: true });
  if (error) {
    fail('insert_error', { detail: error.message });
    return res.status(200).json({ ok: true, stored: false });
  }
  log('photo_flagged', { key: row.photo_key, species: row.species, reason });
  return res.status(200).json({ ok: true, stored: true });
}
