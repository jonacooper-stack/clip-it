// Photos that must never be shown: library photos we've retired, and any
// photo a player reported as wrong (table crew_photo_flags, migration 0009).
// Everything Scout serves is passed through withoutBlocked() first, including
// content cached before the photo was reported.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE_URL, log } from './server';

// Retired from the curated library (wrong or unsuitable images).
const RETIRED = ['beaver', 'kestrel', 'red-tailed-hawk-1'].map((slug) => `${SITE_URL}/img/library/${slug}.jpg`);

// One key per image, whatever size or host it's served at.
export function photoKey(url: string): string {
  const m = url.match(/wikipedia\/commons\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2}\/[^/?#]+)/i);
  if (m) {
    try {
      return `commons:${decodeURIComponent(m[1])}`;
    } catch {
      return `commons:${m[1]}`;
    }
  }
  return url.split(/[?#]/)[0].replace(/^http:/, 'https:');
}

const RETIRED_KEYS = new Set(RETIRED.map(photoKey));

export async function blockedKeys(db: SupabaseClient | null, urls: string[]): Promise<Set<string>> {
  const keys = [...new Set(urls.map(photoKey))];
  const out = new Set(keys.filter((k) => RETIRED_KEYS.has(k)));
  if (!db || !keys.length) return out;
  try {
    for (let i = 0; i < keys.length; i += 100) {
      const { data, error } = await db.from('crew_photo_flags').select('photo_key').in('photo_key', keys.slice(i, i + 100)).eq('cleared', false);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) out.add(r.photo_key);
    }
  } catch (err: any) {
    // Table missing (migration 0009 not run yet) or a hiccup: show what we have.
    log('photo_flags_lookup_error', { detail: String(err?.message ?? err).slice(0, 160) });
  }
  return out;
}

export async function withoutBlocked<T extends { url: string }>(db: SupabaseClient | null, photos: T[] | undefined | null): Promise<T[]> {
  if (!photos?.length) return [];
  const blocked = await blockedKeys(db, photos.map((p) => p.url));
  return blocked.size ? photos.filter((p) => !blocked.has(photoKey(p.url))) : photos;
}
