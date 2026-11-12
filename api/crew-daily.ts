import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, log, safeEqual } from './_lib/server';
import { ensureCrew, hasCrewComment, retireOldCrew } from './_lib/crewAccounts';
import { getFacts, NotAnAnimal, scoutComment, scoutWelcome, speciesKey } from './_lib/crewFacts';
import { prewarmStories } from './_lib/stories';
import { dailyPick } from './_lib/library';
import { weekOf } from '../shared/crew';
import { cleanName } from '../shared/moderation';
import { clearDeletedAccounts, expireRefusalNotes, printWallPhotos, retryDeletedPhotos, settleLegacyScores, startLegacyClock, sweepOrphanPhotos } from './_lib/journalUpkeep';

// Daily Scout job (Vercel Cron, see vercel.json). Also runnable by hand:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://clipitwildlife.app/api/crew-daily?dry=1"
// ?dry=1 previews without writing.
//
// 1. Looks after the cloud journal, first, so it always gets its turn:
//    removes stored photos of deleted accounts and deleted sightings, drops
//    old notes about refused photos, fingerprints new wall photos (so a photo
//    copied from the wall is recognised), and settles scores once the legacy
//    window has closed. None of it calls a model; each step has its own time
//    limit.
// 2. Creates Scout's account on first run, and removes the earlier Field Crew
//    bot accounts (their comments go with them).
// 3. Recent wall posts get at most one Scout comment each: a welcome on a
//    player's very first post, otherwise a fun fact about the species
//    (catching posts shared from older app versions or while facts were down).
// 4. Writes upcoming stories ahead of time (this week's themes, today's and
//    tomorrow's animal of the day), so "Read the story" opens instantly.
//
// Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET in Vercel; run
// supabase/migrations/0007_field_crew.sql first.

export const config = { maxDuration: 60 };
const MAX_NEW_FACTS_PER_RUN = 12;

export async function runCrewDaily(db: SupabaseClient, opts: { dry?: boolean } = {}) {
  const started = Date.now();
  const dry = Boolean(opts.dry);

  // The cloud journal's housekeeping. Deletions come first: a player who
  // deleted their account was told their photos go within a day.
  const journal = { clockStarted: false, deletedAccounts: 0, deletedPhotos: 0, orphanFolders: 0, wallPrints: 0, settled: 0 };
  if (!dry) {
    try {
      journal.clockStarted = await startLegacyClock(db);
      journal.deletedAccounts = await clearDeletedAccounts(db, { deadline: Date.now() + 6000 });
      journal.deletedPhotos = await retryDeletedPhotos(db, { deadline: Date.now() + 3000 });
      journal.orphanFolders = await sweepOrphanPhotos(db, { deadline: Date.now() + 5000 });
      await expireRefusalNotes(db);
      journal.settled = await settleLegacyScores(db);
      journal.wallPrints = await printWallPhotos(db, { deadline: Date.now() + 8000 });
    } catch (err: any) {
      log('crew_daily_journal_error', { detail: String(err?.message ?? err).slice(0, 200) });
    }
  }

  const retired = await retireOldCrew(db, { dry });
  const crew = await ensureCrew(db, { dry });
  const scout = crew.scout;

  const comments: Record<string, unknown>[] = [];
  if (scout) {
    const { data: recent } = await db
      .from('feed_posts')
      .select('id, user_id, common_name, scientific_name')
      .gt('created_at', new Date(Date.now() - 36 * 3600_000).toISOString())
      .neq('user_id', scout.id)
      .order('created_at', { ascending: true })
      .limit(200);
    let newFacts = 0;
    for (const p of recent ?? []) {
      if (Date.now() > started + 40_000) break; // the rest gets its comment tomorrow
      if (await hasCrewComment(db, p.id, [scout.id])) continue;
      const { count } = await db.from('feed_posts').select('id', { count: 'exact', head: true }).eq('user_id', p.user_id);
      // Post and profile text is written by players' apps. Scout only repeats
      // (or writes about) what reads like a name; anything else is left out.
      const species = cleanName(p.common_name);
      const sci = cleanName(p.scientific_name, 80);
      let body: string | null = null;
      let kind = 'fact';
      if (count === 1) {
        const { data: author } = await db.from('profiles').select('display_name').eq('id', p.user_id).maybeSingle();
        body = scoutWelcome(cleanName(String(author?.display_name ?? '').split(' ')[0], 30) ?? 'explorer', species);
        kind = 'welcome';
      } else if (species) {
        try {
          // Cap fresh model calls per run; cached species are free.
          const { data: cached } = await db
            .from('crew_facts')
            .select('species_key')
            .eq('species_key', speciesKey(species, sci))
            .maybeSingle();
          if (!cached) {
            if (newFacts >= MAX_NEW_FACTS_PER_RUN) continue;
            newFacts++;
          }
          const facts = await getFacts(db, species, sci);
          body = scoutComment(species, facts, p.id);
        } catch (err: any) {
          if (!(err instanceof NotAnAnimal)) log('crew_daily_facts_error', { detail: String(err?.message ?? err).slice(0, 200) });
        }
      }
      if (!body) continue;
      if (!dry) await db.from('post_comments').insert({ post_id: p.id, user_id: scout.id, body });
      comments.push({ post: p.id, kind });
    }
  }

  // Yesterday's (and older) usage counts are no longer needed.
  if (!dry) {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { error } = await db.from('usage_counters').delete().lt('day', cutoff);
    if (error && !/usage_counters/.test(error.message)) log('crew_daily_cleanup_error', { detail: error.message.slice(0, 160) });
  }

  let stories: string[] = [];
  try {
    stories = await prewarmStories(db, { dry, cap: 6, deadline: started + 45_000, week: weekOf(), dailyPick });
  } catch (err: any) {
    log('crew_daily_stories_error', { detail: String(err?.message ?? err).slice(0, 200) });
  }

  const result = { ok: true, dry, companion: scout ? 'scout' : 'not created yet', retired, comments, journal, stories };
  log('crew_daily_run', result);
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Tolerate stray whitespace around the secret (easy to paste into Vercel or a terminal).
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set' });
  const sent = String(req.headers.authorization ?? '').trim().replace(/^Bearer\s+/i, '').trim();
  if (!safeEqual(sent, secret)) {
    log('crew_daily_unauthorized', { sentLength: sent.length, expectedLength: secret.length });
    return res.status(401).json({ error: 'unauthorized' });
  }
  const db = adminClient();
  if (!db) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
  try {
    return res.status(200).json(await runCrewDaily(db, { dry: req.query.dry === '1' }));
  } catch (err: any) {
    log('crew_daily_error', { detail: String(err?.message ?? err).slice(0, 300) });
    return res.status(500).json({ error: 'crew job failed', detail: String(err?.message ?? err).slice(0, 300) });
  }
}
