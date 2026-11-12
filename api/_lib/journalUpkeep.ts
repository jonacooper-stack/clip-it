// Housekeeping for the cloud journal, run by the nightly job (api/crew-daily.ts):
//   - fingerprint the photos on the wall, so a photo copied from the wall is
//     recognised when someone hands it in as their own sighting;
//   - remove stored journal photos whose account no longer exists;
//   - once the legacy window has closed, settle the scores of accounts that
//     never switched to server-kept scores.
// Each step is bounded (a time budget, a maximum count) and best-effort.
import type { SupabaseClient } from '@supabase/supabase-js';
import { log, ownStorageUrl } from './server';
import { photoFingerprint } from './phash';

const BUCKET = 'journal-photos';

// Wall posts that have a photo and no fingerprint yet, newest first. A post
// whose photo can't be fetched or read gets an empty fingerprint, so it isn't
// tried again every night.
export async function printWallPhotos(db: SupabaseClient, opts: { max?: number; deadline: number }): Promise<number> {
  const { data, error } = await db.rpc('wall_posts_without_prints', { p_limit: opts.max ?? 120 });
  if (error) return 0; // migration 0011 not run yet
  const posts = (data ?? []) as { id: string; user_id: string; photo_url: string | null }[];
  let done = 0;
  const worker = async () => {
    for (let p = posts.shift(); p; p = posts.shift()) {
      if (Date.now() > opts.deadline) return;
      let sha: string | null = null;
      let phash: string | null = null;
      const url = ownStorageUrl(p.photo_url, 'feed-photos'); // only ever fetch from our own storage
      if (url) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) continue; // not there right now: try again another night
          const bytes = Buffer.from(await res.arrayBuffer());
          if (bytes.length <= 6_000_000) ({ sha, phash } = photoFingerprint(bytes.toString('base64')));
        } catch {
          continue;
        }
      }
      const { error: insertError } = await db.from('wall_prints').upsert({ post_id: p.id, user_id: p.user_id, photo_sha: sha, photo_phash: phash }, { onConflict: 'post_id' });
      if (!insertError) done++;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return done;
}

// Stored journal photos live in a folder per account. An account deleted
// from an app build that doesn't know about them leaves its folder behind;
// this removes such folders. It deletes only on a definite "no such account"
// answer. Any error, timeout or unclear answer ends the sweep for this run:
// a failed lookup must never read as "the account is gone".
export async function sweepOrphanPhotos(db: SupabaseClient, opts: { maxFolders?: number; deadline: number; day?: number }): Promise<number> {
  const max = opts.maxFolders ?? 40;
  const { data: entries, error } = await db.storage.from(BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error || !entries?.length) return 0;
  const folders = entries.filter((e) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.name));
  // A different stretch of the list each night, so every folder comes round.
  const start = folders.length > max ? ((opts.day ?? Math.floor(Date.now() / 86_400_000)) * max) % folders.length : 0;
  let removed = 0;
  for (let i = 0; i < Math.min(max, folders.length); i++) {
    if (Date.now() > opts.deadline) break;
    const uid = folders[(start + i) % folders.length].name;
    const { data: found, error: lookupError } = await db.auth.admin.getUserById(uid);
    if (found?.user) continue; // the account exists
    const gone = lookupError && ((lookupError as { status?: number }).status === 404 || (lookupError as { code?: string }).code === 'user_not_found');
    if (!gone) {
      log('journal_sweep_stopped', { detail: String(lookupError?.message ?? 'no answer').slice(0, 120) });
      break;
    }
    const { data: files, error: listError } = await db.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (listError || !files?.length) continue;
    // Leave anything written in the last day alone (a brand-new account, a lookup that lagged).
    if (files.some((f) => Date.now() - Date.parse(f.created_at ?? f.updated_at ?? '') < 86_400_000)) continue;
    const { error: removeError } = await db.storage.from(BUCKET).remove(files.map((f) => `${uid}/${f.name}`));
    if (!removeError) removed++;
  }
  return removed;
}

// See public.settle_legacy_scores in migration 0011. Does nothing while the
// legacy window is open.
export async function settleLegacyScores(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc('settle_legacy_scores');
  return error ? 0 : Number(data ?? 0);
}
