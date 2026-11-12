import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, dailyLimitReached, log, rateLimited, secondsToUtcMidnight, verifyPlayer } from '../_lib/server';
import { JournalBusy, JournalUnavailable, syncJournal, withJournalLock, type SyncBody } from '../_lib/journal';
import { photoFingerprint } from '../_lib/phash';
import { supabaseJournalDb } from '../_lib/journalDb';

// POST /api/journal/sync
//   { account?, tz?, items?: [{ id, receipt?, legacy?, photoBase64?, science?, proposedSpecies?, wallPostId? }],
//     deletes?: [id], prefs?: { backup?: 'yes' | 'no', places?: boolean }, erase?: true, purge?: true }
//
// The app's side of the cloud journal. It sends:
//   - sightings the identify endpoint couldn't record at the time (with the
//     signed receipt it was given), and, once, the journal the player built
//     up on the phone before journals moved to the cloud (`legacy`);
//   - the player's own additions (field notes, a suggested species, which
//     wall post shares a sighting);
//   - sightings the player deleted;
//   - the player's two choices when they change (`prefs`): whether the
//     journal is saved to the account at all, and whether places are saved
//     with it. Nothing is stored for an account that hasn't said yes;
//   - `erase`: remove everything saved to the account's journal (the player
//     turned the backup off and asked for that, or turned out to be under 13);
//   - `purge`, just before an account is deleted: remove its stored photos.
// The answer has each row as the server now holds it (points included), the
// player's totals and the account's choices as they now stand. The app reads the journal itself straight from the
// table (players can read their own rows); only writing goes through here,
// because everything written here affects the score.
//
// Status codes the app relies on:
//   200  done    401  sign in again    429  slow down
//   403  the account hasn't answered the age question yet (13 and up only):
//        nothing is saved until it has. Removing things is still allowed
//   409  the app is acting for a different account than the one signed in
//   503  not available right now (no database, migration not run, or turned
//        off with JOURNAL_SYNC=off): keep the changes and try again later

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('journal_sync_failure', { reason, ...extra });
  const player = await verifyPlayer(req.headers.authorization, fail, { freshAge: true });
  if (!player) return res.status(401).json({ error: 'sign in required' });
  const userId = player.userId;
  if (process.env.JOURNAL_SYNC === 'off') return res.status(503).json({ error: 'journal sync is turned off' });
  if (rateLimited(`journal:${userId}`, 40)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'too many requests' });
  }
  // (Same guard as the identify endpoint: the account the app thinks it is.)
  const body = (req.body ?? {}) as SyncBody & { account?: unknown; why?: unknown };
  if (typeof body.account === 'string' && body.account !== userId) return res.status(409).json({ error: 'signed in as a different account' });
  // Only removing is allowed before the age question has been answered.
  const removing = body.erase === true || body.purge === true;
  if (!player.ageCleared && !removing) return res.status(403).json({ error: 'age check needed' });
  const db = adminClient();
  if (!db) return res.status(503).json({ error: 'journal is not set up' });
  if (await dailyLimitReached(db, userId, 'journal')) {
    fail('daily_limit', { userId });
    res.setHeader('Retry-After', String(secondsToUtcMidnight()));
    return res.status(429).json({ error: 'daily limit reached' });
  }

  try {
    const jdb = supabaseJournalDb(db);
    // One request at a time per account: everything here reads the journal
    // and then writes to it.
    const out = await withJournalLock(jdb, userId, 8000, () =>
      syncJournal(jdb, userId, body, {
        fingerprint: photoFingerprint,
        // Worth knowing about: a receipt stops verifying when the signing key is changed.
        onBadReceipt: (sid) => fail('receipt_not_accepted', { userId, sighting: sid }),
      }),
    );
    // Worth a line in the log: for an under-13 answer the account itself is still there to deal with.
    if (body.erase === true) log('journal_erased', { userId, why: body.why === 'under13' ? 'under13' : 'asked' });
    return res.status(200).json(out);
  } catch (err: any) {
    if (err instanceof JournalBusy) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ error: 'journal busy' });
    }
    const unavailable = err instanceof JournalUnavailable;
    fail(unavailable ? 'unavailable' : 'error', { userId, detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(unavailable ? 503 : 500).json({ error: unavailable ? 'journal unavailable' : 'sync failed' });
  }
}
