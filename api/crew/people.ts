import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, log, rateLimited, verifyUser } from '../_lib/server';
import { withArticle } from '../../shared/crew';

// POST /api/crew/people  { species: string[] }
// Scout's "explorers you might like": players worth following, picked from
// recent wall posts. Favors people who explore the same region (only if they
// allow it) and who've found the same animals as you (`species`: names from
// the caller's journal). Never returns bots, people you follow, people you've
// blocked or who blocked you, or anyone who opted out. Nobody's region is
// ever returned; the reason just says "near you".

export const config = { maxDuration: 30 };
const DAY = 86_400_000;
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

interface PersonPost { postId: string; photoUrl: string; commonName: string | null; likes: number; createdAt: string }
interface Person { userId: string; name: string; avatarUrl: string | null; reason: string; near: boolean; shared: number; posts: PersonPost[] }

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await run(ids.slice(i, i + 150));
    out.push(...(data ?? []));
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('crew_people_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`people:${userId}`, 10)) return res.status(429).json({ error: 'too many requests' });
  const db = adminClient();
  if (!db) return res.status(200).json({ people: [] });

  const raw = (req.body ?? {}) as { species?: unknown };
  const species = (Array.isArray(raw.species) ? raw.species : []).slice(0, 120).map((x) => String(x).slice(0, 80));
  try {
    const people = await suggestPeople(db, userId, species);
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.status(200).json({ people });
  } catch (err: any) {
    fail('query_error', { detail: String(err?.message ?? err).slice(0, 200) });
    return res.status(200).json({ people: [] });
  }
}

export async function suggestPeople(db: SupabaseClient, userId: string, species: string[]): Promise<Person[]> {
  const mySpecies = new Set(species.map(norm).filter(Boolean));
  const [mine, follows, blocked, blockedBy] = await Promise.all([
    db.from('profile_private').select('home_region').eq('id', userId).maybeSingle(),
    db.from('follows').select('following_id').eq('follower_id', userId),
    db.from('user_blocks').select('blocked_id').eq('blocker_id', userId),
    db.from('user_blocks').select('blocker_id').eq('blocked_id', userId),
  ]);
  const myRegion: string | null = mine.data?.home_region ?? null;
  const exclude = new Set<string>([
    userId,
    ...(follows.data ?? []).map((r: any) => r.following_id),
    ...(blocked.data ?? []).map((r: any) => r.blocked_id),
    ...(blockedBy.data ?? []).map((r: any) => r.blocker_id),
  ]);

  const { data: posts } = await db
    .from('feed_posts')
    .select('id, user_id, common_name, scientific_name, photo_url, created_at')
    .not('photo_url', 'is', null)
    .gt('created_at', new Date(Date.now() - 45 * DAY).toISOString())
    .order('created_at', { ascending: false })
    .limit(600);
  const candidates = (posts ?? []).filter((p: any) => !exclude.has(p.user_id));
  const authors = [...new Set(candidates.map((p: any) => p.user_id as string))];
  if (!authors.length) return [];

  const [profiles, privates, likes] = await Promise.all([
    inChunks<any>(authors, (ids) => db.from('profiles').select('id, display_name, avatar_url, is_bot').in('id', ids)),
    inChunks<any>(authors, (ids) => db.from('profile_private').select('id, home_region, discoverable').in('id', ids)),
    inChunks<any>(candidates.map((p: any) => p.id), (ids) => db.from('post_likes').select('post_id').in('post_id', ids)),
  ]);
  const profileOf = new Map(profiles.map((p) => [p.id, p]));
  const privateOf = new Map(privates.map((p) => [p.id, p]));
  const likeCount = new Map<string, number>();
  for (const l of likes) likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);

  const people: (Person & { score: number })[] = [];
  for (const uid of authors) {
    const prof = profileOf.get(uid);
    const priv = privateOf.get(uid);
    if (!prof || prof.is_bot || priv?.discoverable === false) continue;
    const theirs: PersonPost[] = candidates
      .filter((p: any) => p.user_id === uid)
      .map((p: any) => ({ postId: p.id, photoUrl: p.photo_url, commonName: p.common_name, likes: likeCount.get(p.id) ?? 0, createdAt: p.created_at, sci: p.scientific_name }))
      .sort((a, b) => b.likes - a.likes || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const sharedPosts = theirs.filter((p: any) => mySpecies.has(norm(p.commonName)) || mySpecies.has(norm(p.sci)));
    const sharedNames = new Set(sharedPosts.map((p) => norm(p.commonName)));
    const near = Boolean(myRegion && myRegion !== 'elsewhere' && priv?.home_region === myRegion);
    const totalLikes = theirs.reduce((n, p) => n + p.likes, 0);
    const freshest = Date.parse(theirs.reduce((a, p) => (p.createdAt > a ? p.createdAt : a), ''));
    const score =
      (near ? 5 : 0) + Math.min(sharedNames.size, 3) * 3 + Math.log2(1 + totalLikes) + Math.min(theirs.length, 5) * 0.5 + (Date.now() - freshest < 7 * DAY ? 1 : 0);
    const sharedName = sharedPosts[0]?.commonName;
    const reason =
      near && sharedName
        ? `Explores near you and also found ${withArticle(sharedName.toLowerCase())}`
        : near
          ? 'Explores near you'
          : sharedName
            ? `Also found ${withArticle(sharedName.toLowerCase())}, like you`
            : totalLikes >= 3
              ? 'Popular on the wall'
              : 'New to the wall';
    // Show the shared find first, then their best photos.
    const show = [...sharedPosts.slice(0, 1), ...theirs.filter((p) => p !== sharedPosts[0])].slice(0, 3).map(({ sci, ...p }: any) => p);
    people.push({ userId: uid, name: prof.display_name || 'Explorer', avatarUrl: prof.avatar_url ?? null, reason, near, shared: sharedNames.size, posts: show, score });
  }
  people.sort((a, b) => b.score - a.score);
  return people.slice(0, 6).map(({ score, ...p }) => p);
}
