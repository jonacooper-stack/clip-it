import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, log } from './_lib/server';
import { ensureCrew, hasCrewComment } from './_lib/crewAccounts';
import { kestrelGain } from './_lib/kestrel';
import { getFacts, hootComment, speciesKey } from './_lib/crewFacts';
import { withArticle } from '../shared/crew';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Daily Field Crew job (Vercel Cron, see vercel.json). Also runnable by hand:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://clipitwildlife.app/api/crew-daily?dry=1"
// ?dry=1 previews without writing; ?force=1 moves Kestrel even if it already did today.
//
// 1. Creates the crew accounts on first run.
// 2. Kestrel (the rival) takes its daily step on the leaderboard.
// 3. Recent wall posts get at most one crew comment each: Moss welcomes a
//    player's very first post; otherwise Dr. Hoot adds a fact about the species
//    (catching posts shared from older app versions or while facts were down).
//
// Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET in Vercel; run
// supabase/migrations/0007_field_crew.sql first.

export const config = { maxDuration: 60 };
const DAY = 86_400_000;
const MAX_NEW_FACTS_PER_RUN = 12;

function mossWelcome(name: string, species: string | null): string {
  const first = name.split(' ')[0] || 'explorer';
  return species
    ? `🐢 Welcome to the wall, ${first}! ${cap(withArticle(species))} for your first post, what a start. Slow and steady, see you out there.`
    : `🐢 Welcome to the wall, ${first}! Great first sighting. Slow and steady, see you out there.`;
}

export async function runCrewDaily(db: SupabaseClient, opts: { dry?: boolean; force?: boolean; rand?: () => number } = {}) {
  const dry = Boolean(opts.dry);
  const rand = opts.rand ?? Math.random;
  const crew = await ensureCrew(db, { dry });
  const crewIds = Object.values(crew).map((c) => c!.id);

  // ---- Kestrel's daily step ----
  let kestrel: Record<string, unknown> = { note: 'not created yet' };
  const k = crew.kestrel;
  if (k) {
    if (!opts.force && Date.now() - Date.parse(k.updated_at) < 20 * 3600_000) {
      kestrel = { note: 'already moved today', points: k.points };
    } else {
      const { data: real, error } = await db
        .from('profiles')
        .select('points, updated_at')
        .eq('is_bot', false)
        .gt('points', 0)
        .order('points', { ascending: false })
        .limit(5000);
      if (error) throw new Error(`profiles: ${error.message}`);
      const topReal = real?.[0]?.points ?? 0;
      const activePoints = (real ?? []).filter((r) => Date.now() - Date.parse(r.updated_at) < 30 * DAY).map((r) => r.points);
      const gain = kestrelGain(k.points, { activePoints, topReal, rand });
      if (!dry) {
        const { error: upErr } = await db
          .from('profiles')
          .update({ points: k.points + gain, species_count: k.species_count + (gain > 0 && rand() < 0.3 ? 1 : 0), updated_at: new Date().toISOString() })
          .eq('id', k.id);
        if (upErr) throw new Error(`kestrel: ${upErr.message}`);
      }
      kestrel = { from: k.points, gain, topReal, active: activePoints.length };
    }
  }

  // ---- one crew comment per recent wall post ----
  const comments: Record<string, unknown>[] = [];
  if (crewIds.length) {
    const { data: recent } = await db
      .from('feed_posts')
      .select('id, user_id, common_name, scientific_name')
      .gt('created_at', new Date(Date.now() - 36 * 3600_000).toISOString())
      .not('user_id', 'in', `(${crewIds.join(',')})`)
      .order('created_at', { ascending: true })
      .limit(200);
    let newFacts = 0;
    for (const p of recent ?? []) {
      if (await hasCrewComment(db, p.id, crewIds)) continue;
      const { count } = await db.from('feed_posts').select('id', { count: 'exact', head: true }).eq('user_id', p.user_id);
      let body: string | null = null;
      let by: string | undefined;
      if (count === 1 && crew.moss) {
        const { data: author } = await db.from('profiles').select('display_name').eq('id', p.user_id).maybeSingle();
        body = mossWelcome(author?.display_name ?? 'explorer', p.common_name);
        by = crew.moss.id;
      } else if (p.common_name && crew.hoot) {
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
          body = hootComment(p.common_name, facts, p.id);
          by = crew.hoot.id;
        } catch (err: any) {
          log('crew_daily_facts_error', { detail: String(err?.message ?? err).slice(0, 200) });
        }
      }
      if (!body || !by) continue;
      if (!dry) await db.from('post_comments').insert({ post_id: p.id, user_id: by, body });
      comments.push({ post: p.id, by: by === crew.moss?.id ? 'moss' : 'hoot' });
    }
  }

  const result = { ok: true, dry, crew: Object.keys(crew), kestrel, comments };
  log('crew_daily_run', result);
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const db = adminClient();
  if (!db) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
  try {
    return res.status(200).json(await runCrewDaily(db, { dry: req.query.dry === '1', force: req.query.force === '1' }));
  } catch (err: any) {
    log('crew_daily_error', { detail: String(err?.message ?? err).slice(0, 300) });
    return res.status(500).json({ error: 'crew job failed', detail: String(err?.message ?? err).slice(0, 300) });
  }
}
