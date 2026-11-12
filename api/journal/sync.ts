import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, dailyLimitReached, log, rateLimited, secondsToUtcMidnight, verifyUser } from '../_lib/server';
import { JournalUnavailable, syncJournal, type SyncBody } from '../_lib/journal';
import { supabaseJournalDb } from '../_lib/journalDb';

// POST /api/journal/sync
//   { account?, tz?, items?: [{ id, receipt?, legacy?, photoBase64?, science?, proposedSpecies?, wallPostId? }],
//     deletes?: [id] }
//
// The app's side of the cloud journal. It sends:
//   - sightings the identify endpoint couldn't record at the time (with the
//     signed receipt it was given), and, once, the journal the player built
//     up on the phone before journals moved to the cloud (`legacy`);
//   - the player's own additions (field notes, a suggested species, which
//     wall post shares a sighting);
//   - sightings the player deleted.
// The answer has each row as the server now holds it (points included) and
// the player's totals. The app reads the journal itself straight from the
// table (players can read their own rows); only writing goes through here,
// because everything written here affects the score.
//
// Status codes the app relies on:
//   200  done    401  sign in again    429  slow down
//   409  the app is acting for a different account than the one signed in
//   503  not available right now (no database, migration not run, or turned
//        off with JOURNAL_SYNC=off): keep the changes and try again later

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('journal_sync_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (process.env.JOURNAL_SYNC === 'off') return res.status(503).json({ error: 'journal sync is turned off' });
  if (rateLimited(`journal:${userId}`, 40)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'too many requests' });
  }
  // (Same guard as the identify endpoint: the account the app thinks it is.)
  const account = (req.body ?? {}).account;
  if (typeof account === 'string' && account !== userId) return res.status(409).json({ error: 'signed in as a different account' });
  const db = adminClient();
  if (!db) return res.status(503).json({ error: 'journal is not set up' });
  if (await dailyLimitReached(db, userId, 'journal')) {
    fail('daily_limit', { userId });
    res.setHeader('Retry-After', String(secondsToUtcMidnight()));
    return res.status(429).json({ error: 'daily limit reached' });
  }

  try {
    const out = await syncJournal(supabaseJournalDb(db), userId, (req.body ?? {}) as SyncBody);
    return res.status(200).json(out);
  } catch (err: any) {
    const unavailable = err instanceof JournalUnavailable;
    fail(unavailable ? 'unavailable' : 'error', { userId, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(unavailable ? 503 : 500).json({ error: unavailable ? 'journal unavailable' : 'sync failed' });
  }
}
