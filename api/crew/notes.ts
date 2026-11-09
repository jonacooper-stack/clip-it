import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminClient, bearer, log, rateLimited, userClient, verifyUser } from '../_lib/server';
import { getFacts, scoutComment, type SpeciesFacts } from '../_lib/crewFacts';
import { findLibraryPhoto, type PhotoRef } from '../_lib/library';
import { ensureCrew, hasCrewComment } from '../_lib/crewAccounts';

// POST /api/crew/notes  { species, sci?, postId? }
// Scout's take on a sighting, for the signed-in player:
//   - 3 short facts + a spotting tip (cached per species)
//   - the best recent wall posts of the same species by other players, or a
//     licensed library photo when nobody has posted one yet
// With `postId` (the player just shared this sighting to the wall), Scout also
// leaves one fact as a comment on that post (needs the service role key).

export const config = { maxDuration: 60 };

interface OtherPost {
  postId: string;
  photoUrl: string;
  name: string;
  likes: number;
  createdAt: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const fail = (reason: string, extra: Record<string, unknown> = {}) => log('crew_notes_failure', { reason, ...extra });
  const userId = await verifyUser(req.headers.authorization, fail);
  if (!userId) return res.status(401).json({ error: 'sign in required' });
  if (rateLimited(`notes:${userId}`, 30)) return res.status(429).json({ error: 'too many requests' });

  const body = (req.body ?? {}) as { species?: unknown; sci?: unknown; postId?: unknown };
  const species = typeof body.species === 'string' ? body.species.trim().slice(0, 80) : '';
  const sci = typeof body.sci === 'string' ? body.sci.trim().slice(0, 80) : null;
  const postId = typeof body.postId === 'string' ? body.postId : null;
  if (!species) return res.status(400).json({ error: 'species is required' });

  const db = adminClient();
  const reader = db ?? userClient(bearer(req.headers.authorization)!);

  // Facts
  let facts: SpeciesFacts | null = null;
  try {
    facts = await getFacts(db, species, sci);
  } catch (err: any) {
    fail('facts_error', { species, detail: String(err?.message ?? err).slice(0, 200) });
  }

  // Other players' posts of this species (last 60 days), best first.
  let others: OtherPost[] = [];
  try {
    const { data: posts } = await reader
      .from('feed_posts')
      .select('id, user_id, photo_url, created_at')
      .ilike('common_name', species)
      .neq('user_id', userId)
      .not('photo_url', 'is', null)
      .gt('created_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    if (posts?.length) {
      const ids = posts.map((p) => p.id);
      const authors = Array.from(new Set(posts.map((p) => p.user_id)));
      const [{ data: likes }, { data: people }] = await Promise.all([
        reader.from('post_likes').select('post_id').in('post_id', ids),
        reader.from('profiles').select('id, display_name').in('id', authors),
      ]);
      const likeCount = new Map<string, number>();
      for (const l of likes ?? []) likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
      const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name || 'Explorer']));
      others = posts
        .map((p) => ({ postId: p.id, photoUrl: p.photo_url as string, name: nameOf.get(p.user_id) ?? 'Explorer', likes: likeCount.get(p.id) ?? 0, createdAt: p.created_at }))
        .sort((a, b) => b.likes - a.likes || Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 3);
    }
  } catch (err: any) {
    fail('others_error', { detail: String(err?.message ?? err).slice(0, 200) });
  }
  const photo: PhotoRef | null = others.length ? null : findLibraryPhoto(species, sci, userId.length + species.length);

  // Scout comments on the post the player just shared (once per post).
  let commented = false;
  if (postId && db && facts) {
    try {
      const { data: post } = await db.from('feed_posts').select('id, user_id').eq('id', postId).maybeSingle();
      if (post && post.user_id === userId) {
        const crew = await ensureCrew(db);
        const crewIds = Object.values(crew).map((c) => c!.id);
        if (crew.scout && !(await hasCrewComment(db, postId, crewIds))) {
          const { error } = await db
            .from('post_comments')
            .insert({ post_id: postId, user_id: crew.scout.id, body: scoutComment(species, facts, postId) });
          commented = !error;
          if (error) fail('scout_comment_error', { detail: error.message });
        }
      }
    } catch (err: any) {
      fail('scout_comment_error', { detail: String(err?.message ?? err).slice(0, 200) });
    }
  }

  return res.status(200).json({ facts: facts?.facts ?? [], tip: facts?.tip ?? '', others, photo, commented });
}
