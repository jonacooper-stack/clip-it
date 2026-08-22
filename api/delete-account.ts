import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// In-app account deletion (App Store Review Guideline 5.1.1(v): an app that lets
// you create an account must let you delete it from inside the app, not by
// emailing support).
//
// Deleting the auth user cascades the whole graph — profiles references
// auth.users on delete cascade, and feed_posts, post_comments, post_likes,
// follows, friendships, user_blocks and content_reports all reference profiles
// the same way. Storage objects have no foreign key, so those are removed here
// explicitly first.
//
// Runs on Vercel next to api/identify.ts. It needs SUPABASE_SERVICE_ROLE_KEY as a
// server-only env var — that key bypasses RLS and must never reach the app.

export const config = { maxDuration: 30 };

const BUCKETS = ['avatars', 'feed-photos'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Account deletion is not configured on the server.' });
  }

  // The caller proves who they are with their own access token; we never take a
  // user id from the request body, or anyone could delete anyone.
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in first.' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return res.status(401).json({ error: 'That session is no longer valid.' });

  // Remove everything under the user's own "<uid>/" folder in each public bucket.
  // Best-effort: an orphaned image is harmless, but a failure here must not stop
  // the account itself from being deleted.
  for (const bucket of BUCKETS) {
    try {
      const { data } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
      if (data?.length) {
        await admin.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`));
      }
    } catch {
      // keep going
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return res.status(500).json({ error: delErr.message });

  return res.status(200).json({ deleted: true });
}
