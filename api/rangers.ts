import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { RANGERS, planGain, pickPhoto, photoPoints, type RangerDef } from './_lib/rangers';
import { RANGER_LIBRARY } from './_lib/rangerLibrary';

// Daily job for the ClipIt Rangers (labeled bot accounts). Runs from Vercel
// Cron (see vercel.json) and can be run by hand:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://clipitwildlife.app/api/rangers?dry=1"
//
// ?dry=1 shows what would happen without writing anything; ?force=1 runs even
// if a Ranger already moved in the last 20 hours.
//
// Needs two Vercel environment variables:
//   SUPABASE_SERVICE_ROLE_KEY  the project's service role / secret key (server only)
//   CRON_SECRET                any long random string; Vercel Cron sends it automatically
// Run supabase/migrations/0007_rangers.sql first.

export const config = { maxDuration: 60 };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://oybkykeoatfgcfqgaqpl.supabase.co';
const SITE_URL = (process.env.SITE_URL || 'https://clipitwildlife.app').replace(/\/$/, '');
const DAY = 86_400_000;

function log(event: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event: `rangers_${event}`, ...extra }));
}

type Profile = { id: string; display_name: string | null; points: number; species_count: number; updated_at: string; is_bot: boolean };

// Create the Ranger's auth user + profile if missing. Returns its profile.
async function ensureRanger(db: SupabaseClient, def: RangerDef, dry: boolean): Promise<Profile | null> {
  const avatar = `${SITE_URL}/img/rangers/avatar-${def.key}.png`;
  const { data: existing } = await db
    .from('profiles')
    .select('id, display_name, points, species_count, updated_at, is_bot')
    .eq('is_bot', true)
    .eq('display_name', def.name)
    .maybeSingle();
  if (existing) return existing as Profile;
  if (dry) return null;

  let userId: string | undefined;
  const created = await db.auth.admin.createUser({
    email: def.email,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    user_metadata: { displayName: def.name, ranger: def.key, ageBracket: 'adult' },
  });
  userId = created.data.user?.id;
  if (!userId) {
    // Already exists (e.g. a previous run created the user but not the profile).
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find((u) => u.email === def.email)?.id;
      if (!data.users.length) break;
    }
  }
  if (!userId) throw new Error(`could not create ${def.name}: ${created.error?.message}`);

  const row = {
    id: userId,
    display_name: def.name,
    avatar_url: avatar,
    is_bot: true,
    points: def.seedPoints,
    species_count: def.seedSpecies,
    updated_at: new Date(Date.now() - DAY).toISOString(),
  };
  const { error } = await db.from('profiles').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`profile for ${def.name}: ${error.message}`);
  log('created', { ranger: def.key });
  return { ...row } as Profile;
}

// The day's work, separated from HTTP so it can be tested with a fake client.
export async function runRangers(
  db: SupabaseClient,
  opts: { dry?: boolean; force?: boolean; rand?: () => number } = {},
) {
  const dry = Boolean(opts.dry);
  const force = Boolean(opts.force);
  const rand = opts.rand ?? Math.random;
  const report: Record<string, unknown>[] = [];
  // ---- the community, for pacing ----
  const { data: real, error: realErr } = await db
    .from('profiles')
    .select('id, points, updated_at')
    .eq('is_bot', false)
    .gt('points', 0)
    .order('points', { ascending: false })
    .limit(5000);
  if (realErr) throw new Error(`profiles: ${realErr.message}`);
  const topReal = real?.[0]?.points ?? 0;
  const activePoints = (real ?? []).filter((r) => Date.now() - Date.parse(r.updated_at) < 30 * DAY).map((r) => r.points);

  // ---- each Ranger's day ----
  const rangerIds: string[] = [];
  for (const def of RANGERS) {
    const profile = await ensureRanger(db, def, dry);
    if (!profile) {
      report.push({ ranger: def.key, note: 'would be created' });
      continue;
    }
    rangerIds.push(profile.id);
    if (!force && Date.now() - Date.parse(profile.updated_at) < 20 * 3600_000) {
      report.push({ ranger: def.key, note: 'already moved today' });
      continue;
    }

    const gain = planGain(def, profile.points, { activePoints, topReal, rand });
    let post: { slug: string; points: number } | null = null;
    let newSpecies = gain > 0 && rand() < 0.3 ? 1 : 0;

    // Posting is independent of pacing: a Ranger that's paused on the
    // leaderboard still shares a sighting now and then, so the wall stays
    // lively while the community is small.
    if (rand() < def.postChance) {
      const { data: mine } = await db
        .from('feed_posts')
        .select('photo_url, common_name, created_at')
        .eq('user_id', profile.id)
        .gt('created_at', new Date(Date.now() - 45 * DAY).toISOString());
      const used = new Set((mine ?? []).map((p) => String(p.photo_url ?? '').split('/').pop()?.replace('.jpg', '') ?? ''));
      // Prefer a photo worth about what the Ranger earned today; otherwise any unused one.
      const photo =
        (gain >= 2 ? pickPhoto(RANGER_LIBRARY, def.persona, gain, used, rand) : null) ??
        pickPhoto(RANGER_LIBRARY, def.persona, Number.POSITIVE_INFINITY, used, rand);
      if (photo) {
        const pts = photoPoints(photo.rarity, photo.tags);
        const seenSpecies = (mine ?? []).some((p) => p.common_name === photo.species);
        if (!seenSpecies) newSpecies = 1;
        post = { slug: photo.slug, points: pts };
        if (!dry) {
          // Spread posts across the day rather than all at cron time.
          const createdAt = new Date(Date.now() - Math.floor(rand() * 10 * 3600_000)).toISOString();
          const { error } = await db.from('feed_posts').insert({
            user_id: profile.id,
            common_name: photo.species,
            scientific_name: photo.sci,
            points: pts,
            caption: photo.caption,
            photo_url: `${SITE_URL}/img/rangers/${photo.slug}.jpg`,
            photo_credit: photo.credit,
            created_at: createdAt,
          });
          if (error) throw new Error(`post for ${def.key}: ${error.message}`);
        }
      }
    }

    if (!dry) {
      const { error } = await db
        .from('profiles')
        .update({
          points: profile.points + gain,
          species_count: profile.species_count + newSpecies,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (error) throw new Error(`update ${def.key}: ${error.message}`);
    }
    report.push({ ranger: def.key, from: profile.points, gain, post });
  }

  // ---- light, honest encouragement on real players' recent posts ----
  const engagement: Record<string, unknown>[] = [];
  if (rangerIds.length) {
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    const { data: recent } = await db
      .from('feed_posts')
      .select('id, user_id, common_name')
      .gt('created_at', since)
      .not('user_id', 'in', `(${rangerIds.join(',')})`)
      .limit(200);
    const ids = (recent ?? []).map((p) => p.id);
    if (ids.length) {
      const [{ data: likes }, { data: comments }] = await Promise.all([
        db.from('post_likes').select('post_id, user_id').in('post_id', ids).in('user_id', rangerIds),
        db.from('post_comments').select('post_id, user_id').in('post_id', ids).in('user_id', rangerIds),
      ]);
      const liked = new Set((likes ?? []).map((l) => l.post_id));
      const commented = new Set((comments ?? []).map((c) => c.post_id));
      for (const p of recent ?? []) {
        // At most one Ranger like per post, on about a third of posts.
        if (!liked.has(p.id) && rand() < 0.35) {
          const by = rangerIds[Math.floor(rand() * rangerIds.length)];
          if (!dry) await db.from('post_likes').insert({ post_id: p.id, user_id: by });
          engagement.push({ like: p.id });
        }
        // Welcome a player's very first post on the wall.
        if (!commented.has(p.id)) {
          const { count } = await db.from('feed_posts').select('id', { count: 'exact', head: true }).eq('user_id', p.user_id);
          if (count === 1) {
            const by = rangerIds[Math.floor(rand() * rangerIds.length)];
            const body = p.common_name
              ? `Welcome to the wall! Great first find, a ${p.common_name}. 🌿`
              : 'Welcome to the wall! Great first sighting. 🌿';
            if (!dry) await db.from('post_comments').insert({ post_id: p.id, user_id: by, body });
            engagement.push({ welcome: p.id });
          }
        }
      }
    }
  }

  log('run', { dry, topReal, active: activePoints.length, report, engagement: engagement.length });
  return { ok: true, dry, topReal, activePlayers: activePoints.length, rangers: report, engagement };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
  const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const result = await runRangers(db, { dry: req.query.dry === '1', force: req.query.force === '1' });
    return res.status(200).json(result);
  } catch (err: any) {
    log('error', { detail: String(err?.message ?? err).slice(0, 300) });
    return res.status(500).json({ error: 'rangers job failed', detail: String(err?.message ?? err).slice(0, 300) });
  }
}
