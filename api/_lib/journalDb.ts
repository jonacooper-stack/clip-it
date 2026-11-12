// The cloud journal's storage, over Supabase (the tables and the private
// photo bucket from supabase/migrations/0011_cloud_journal.sql). The rules
// are in journal.ts; this file only reads and writes.
//
// Every method throws JournalUnavailable when the database says no: the
// callers then leave the sighting on the phone to be recorded later.
import type { SupabaseClient } from '@supabase/supabase-js';
import { JournalUnavailable, type JournalDb, type JournalRow, type JournalState, type Print } from './journal';

const SIGHTINGS = 'journal_sightings';
const STATE = 'journal_state';
const BUCKET = 'journal-photos';

function check(error: { message?: string; code?: string } | null | undefined, what: string): void {
  if (error) throw new JournalUnavailable(`${what}: ${error.code ?? ''} ${String(error.message ?? '').slice(0, 160)}`);
}

// When the legacy window closes: read at most once a minute per warm instance.
let legacyCache: { until: number | null; at: number } | null = null;

export function supabaseJournalDb(db: SupabaseClient): JournalDb {
  const stamp = () => new Date().toISOString();
  return {
    async getRow(uid, sid) {
      const { data, error } = await db.from(SIGHTINGS).select('*').eq('user_id', uid).eq('id', sid).maybeSingle();
      check(error, 'read sighting');
      return (data as JournalRow | null) ?? null;
    },

    async liveRows(uid) {
      const out: JournalRow[] = [];
      for (let from = 0; from < 20_000; from += 1000) {
        const { data, error } = await db
          .from(SIGHTINGS)
          .select('*')
          .eq('user_id', uid)
          .is('deleted_at', null)
          .order('observed_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + 999);
        check(error, 'read journal');
        out.push(...((data ?? []) as JournalRow[]));
        if ((data ?? []).length < 1000) break;
      }
      return out;
    },

    async speciesCount(uid, sci, exceptSid) {
      const { count, error } = await db
        .from(SIGHTINGS)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('scientific_name', sci)
        .neq('id', exceptSid);
      check(error, 'count species');
      return count ?? 0;
    },

    async lookAlikes(sci, sha) {
      const cols = 'user_id, id, photo_sha, photo_phash';
      const [bySpecies, bySha] = await Promise.all([
        db.from(SIGHTINGS).select(cols).eq('scientific_name', sci).not('photo_phash', 'is', null).order('recorded_at', { ascending: false }).limit(3000),
        sha ? db.from(SIGHTINGS).select(cols).eq('photo_sha', sha).limit(20) : Promise.resolve({ data: [], error: null }),
      ]);
      check(bySpecies.error, 'read fingerprints');
      check(bySha.error, 'read fingerprints');
      return [...((bySpecies.data ?? []) as Print[]), ...((bySha.data ?? []) as Print[])];
    },

    async insertRow(row) {
      const { error } = await db.from(SIGHTINGS).insert(row);
      if (error?.code === '23505') return false; // already there
      check(error, 'write sighting');
      return true;
    },

    async updateRow(uid, sid, patch) {
      const { error } = await db.from(SIGHTINGS).update({ ...patch, updated_at: stamp() }).eq('user_id', uid).eq('id', sid);
      check(error, 'update sighting');
    },

    async getState(uid) {
      const { data, error } = await db.from(STATE).select('user_id, tz, ready_at, baseline_points, carryover_points, legacy_points').eq('user_id', uid).maybeSingle();
      check(error, 'read journal state');
      return (data as JournalState | null) ?? null;
    },

    async saveState(uid, patch) {
      const { error } = await db.from(STATE).upsert({ user_id: uid, ...patch, updated_at: stamp() }, { onConflict: 'user_id' });
      check(error, 'write journal state');
    },

    async profilePoints(uid) {
      const { data, error } = await db.from('profiles').select('points').eq('id', uid).maybeSingle();
      check(error, 'read profile');
      return typeof (data as any)?.points === 'number' ? (data as any).points : null;
    },

    async setProfileTotals(uid, points, speciesCount) {
      const totals = { points, species_count: speciesCount, updated_at: stamp() };
      const { data, error } = await db.from('profiles').update(totals).eq('id', uid).select('id');
      check(error, 'write score');
      if (data?.length) return;
      // No profile row yet (the app creates it with the player's name). Make
      // one so the score has somewhere to live; the app fills in the name.
      const { error: insertError } = await db.from('profiles').upsert({ id: uid, display_name: 'Explorer', ...totals }, { onConflict: 'id', ignoreDuplicates: true });
      check(insertError, 'create profile');
    },

    async legacyUntil() {
      if (legacyCache && Date.now() - legacyCache.at < 60_000) return legacyCache.until;
      const { data, error } = await db.from('app_settings').select('value').eq('key', 'legacy_import_until').maybeSingle();
      check(error, 'read settings');
      const t = typeof (data as any)?.value === 'string' ? Date.parse((data as any).value) : NaN;
      legacyCache = { until: Number.isFinite(t) ? t : null, at: Date.now() };
      return legacyCache.until;
    },

    async putPhoto(uid, sid, bytes, contentType) {
      const { error } = await db.storage.from(BUCKET).upload(`${uid}/${sid}.jpg`, bytes, { contentType, upsert: true });
      return !error; // a missing photo is not fatal: the app offers it again on its next sync
    },

    async removePhotos(uid, sids) {
      try {
        await db.storage.from(BUCKET).remove(sids.map((sid) => `${uid}/${sid}.jpg`));
      } catch {
        // the nightly sweep and account deletion clear leftovers
      }
    },
  };
}
