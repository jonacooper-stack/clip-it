// Housekeeping for the cloud journal, run by the nightly job (api/crew-daily.ts):
//   - fingerprint the photos on the wall, so a photo copied from the wall is
//     recognised when someone hands it in as their own sighting;
//   - remove stored journal photos whose account no longer exists, and
//     photos of deleted sightings that storage didn't confirm at the time;
//   - remove notes about refused photos after 90 days;
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

// Every file in an account's photo folder, removed. True only when a listing
// of the folder then comes back empty: any error or doubt is "not yet".
async function emptyFolder(db: SupabaseClient, uid: string): Promise<boolean> {
  for (let round = 0; round < 20; round++) {
    const { data: files, error } = await db.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (error || !files) return false;
    if (!files.length) return true;
    const { error: removeError } = await db.storage.from(BUCKET).remove(files.map((f) => `${uid}/${f.name}`));
    if (removeError) return false;
  }
  return false;
}

// Is this account gone? true / false, or null when the answer is unclear (an
// error, a timeout): a failed lookup must never read as "the account is gone".
async function accountGone(db: SupabaseClient, uid: string): Promise<boolean | null> {
  try {
    const { data: found, error } = await db.auth.admin.getUserById(uid);
    if (found?.user) return false;
    const gone = error && ((error as { status?: number }).status === 404 || (error as { code?: string }).code === 'user_not_found');
    return gone ? true : null;
  } catch {
    return null;
  }
}

// Stored journal photos live in a folder per account. An account deleted
// from an app build that doesn't know about them leaves its folder behind,
// and normally leaves a note that clearDeletedAccounts acts on. This is the
// safety net behind that: it walks the folders (a different stretch each
// night, so every folder comes round) and removes those whose account is
// definitely gone. Any unclear answer ends the sweep for this run.
export async function sweepOrphanPhotos(db: SupabaseClient, opts: { maxFolders?: number; deadline: number; day?: number }): Promise<number> {
  const max = opts.maxFolders ?? 40;
  const folders: string[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data: entries, error } = await db.storage.from(BUCKET).list('', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) return 0;
    for (const e of entries ?? []) if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.name)) folders.push(e.name);
    if ((entries ?? []).length < 1000 || Date.now() > opts.deadline) break;
  }
  if (!folders.length) return 0;
  const start = folders.length > max ? ((opts.day ?? Math.floor(Date.now() / 86_400_000)) * max) % folders.length : 0;
  let removed = 0;
  for (let i = 0; i < Math.min(max, folders.length); i++) {
    if (Date.now() > opts.deadline) break;
    const uid = folders[(start + i) % folders.length];
    const gone = await accountGone(db, uid);
    if (gone === false) continue;
    if (gone === null) {
      log('journal_sweep_stopped', { detail: 'account lookup unclear' });
      break;
    }
    const { data: files, error: listError } = await db.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (listError || !files?.length) continue;
    // Leave anything written in the last day alone (a brand-new account, a lookup that lagged).
    if (files.some((f) => Date.now() - Date.parse(f.created_at ?? f.updated_at ?? '') < 86_400_000)) continue;
    if (await emptyFolder(db, uid)) removed++;
  }
  return removed;
}

// Accounts whose deletion left a note (public.journal_photo_cleanup): remove
// their stored photos, then the note. The photos go only when the account is
// definitely gone, and the note goes only when the folder is confirmed empty:
// if anything fails, the note stays and the next run tries again.
export async function clearDeletedAccounts(db: SupabaseClient, opts: { deadline: number }): Promise<number> {
  const { data, error } = await db.from('journal_photo_cleanup').select('user_id').order('queued_at', { ascending: true }).limit(50);
  if (error) return 0; // migration 0011 not run yet
  let cleared = 0;
  for (const { user_id: uid } of (data ?? []) as { user_id: string }[]) {
    if (Date.now() > opts.deadline) break;
    const gone = await accountGone(db, uid);
    if (gone === null) break; // unclear answer: leave everything as it is
    // (If the account still exists, only its leaderboard row was removed: nothing to clear.)
    if (gone && !(await emptyFolder(db, uid))) continue;
    await db.from('journal_photo_cleanup').delete().eq('user_id', uid);
    cleared++;
  }
  return cleared;
}

// A deleted sighting's stored photo is removed with it. If storage didn't
// confirm that at the time, the marker still says it has a photo: try again.
export async function retryDeletedPhotos(db: SupabaseClient, opts: { deadline: number }): Promise<number> {
  const { data, error } = await db.from('journal_sightings').select('user_id, id').not('deleted_at', 'is', null).eq('has_photo', true).limit(200);
  if (error) return 0;
  const byUser = new Map<string, string[]>();
  for (const r of (data ?? []) as { user_id: string; id: string }[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.id]);
  let removed = 0;
  for (const [uid, sids] of byUser) {
    if (Date.now() > opts.deadline) break;
    const { error: removeError } = await db.storage.from(BUCKET).remove(sids.map((sid) => `${uid}/${sid}.jpg`));
    if (removeError) continue;
    const { error: updateError } = await db.from('journal_sightings').update({ has_photo: false }).eq('user_id', uid).in('id', sids);
    if (!updateError) removed += sids.length;
  }
  return removed;
}

// Notes about refused photos are kept for 90 days (long enough to look into a
// complaint), then removed.
export async function expireRefusalNotes(db: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { error } = await db.from('journal_refusals').delete().lt('created_at', cutoff);
  if (error && !/journal_refusals/.test(error.message)) log('journal_refusals_cleanup_error', { detail: error.message.slice(0, 160) });
}

// The legacy window (see migration 0011) starts counting the first time the
// updated server runs this job: 30 days from then. Until a date is set the
// window is open. Leaves an existing date alone.
export async function startLegacyClock(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from('app_settings').select('key').eq('key', 'legacy_import_until').maybeSingle();
  if (error || data) return false;
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error: insertError } = await db.from('app_settings').insert({ key: 'legacy_import_until', value: until });
  if (!insertError) log('legacy_window_set', { until });
  return !insertError;
}

// See public.settle_legacy_scores in migration 0011. Does nothing while the
// legacy window is open.
export async function settleLegacyScores(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc('settle_legacy_scores');
  return error ? 0 : Number(data ?? 0);
}
