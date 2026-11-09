import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, log } from './_lib/server';
import { ensureCrew, hasCrewComment, retireOldCrew } from './_lib/crewAccounts';
import { getFacts, scoutComment, scoutWelcome, speciesKey } from './_lib/crewFacts';

// Daily Scout job (Vercel Cron, see vercel.json). Also runnable by hand:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://clipitwildlife.app/api/crew-daily?dry=1"
// ?dry=1 previews without writing.
//
// 1. Creates Scout's account on first run, and removes the earlier Field Crew
//    bot accounts (their comments go with them).
// 2. Recent wall posts get at most one Scout comment each: a welcome on a
//    player's very first post, otherwise a fun fact about the species
//    (catching posts shared from older app versions or while facts were down).
//
// Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET in Vercel; run
// supabase/migrations/0007_field_crew.sql first.

export const config = { maxDuration: 60 };
const MAX_NEW_FACTS_PER_RUN = 12;

export async function runCrewDaily(db: SupabaseClient, opts: { dry?: boolean } = {}) {
  const dry = Boolean(opts.dry);
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
      if (await hasCrewComment(db, p.id, [scout.id])) continue;
      const { count } = await db.from('feed_posts').select('id', { count: 'exact', head: true }).eq('user_id', p.user_id);
      let body: string | null = null;
      let kind = 'fact';
      if (count === 1) {
        const { data: author } = await db.from('profiles').select('display_name').eq('id', p.user_id).maybeSingle();
        body = scoutWelcome(author?.display_name ?? 'explorer', p.common_name);
        kind = 'welcome';
      } else if (p.common_name) {
        try {
          // Cap fresh model calls per run; cached species are free.
          const { data: cached } = await db
            .from('crew_facts')
            .select('species_key')
            .eq('species_key', speciesKey(p.common_name, p.scientific_name))
            .maybeSingle();
          if (!cached) {
            if (newFacts >= MAX_NEW_FACTS_PER_RUN) continue;
            newFacts++;
          }
          const facts = await getFacts(db, p.common_name, p.scientific_name);
          body = scoutComment(p.common_name, facts, p.id);
        } catch (err: any) {
          log('crew_daily_facts_error', { detail: String(err?.message ?? err).slice(0, 200) });
        }
      }
      if (!body) continue;
      if (!dry) await db.from('post_comments').insert({ post_id: p.id, user_id: scout.id, body });
      comments.push({ post: p.id, kind });
    }
  }

  const result = { ok: true, dry, companion: scout ? 'scout' : 'not created yet', retired, comments };
  log('crew_daily_run', result);
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Tolerate stray whitespace around the secret (easy to paste into Vercel or a terminal).
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set' });
  const sent = String(req.headers.authorization ?? '').trim().replace(/^Bearer\s+/i, '').trim();
  if (sent !== secret) {
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
