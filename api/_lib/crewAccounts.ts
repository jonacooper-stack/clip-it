// Scout's account (needed so Scout's comments on the wall reference a
// profile). Created on first use with the service role.
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CREW, CREW_KEYS, RETIRED_CREW, type CrewKey } from '../../shared/crew';
import { SITE_URL, log } from './server';

export type CrewProfile = { id: string; points: number; species_count: number; updated_at: string };

const email = (key: CrewKey) => `crew-${key}@crew.clipitwildlife.app`;

async function findUserId(db: SupabaseClient, addr: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.email === addr);
    if (hit) return hit.id;
    if (data.users.length < 200) return undefined;
  }
  return undefined;
}

// Returns each crew member's profile, creating any that are missing.
export async function ensureCrew(db: SupabaseClient, opts: { dry?: boolean } = {}): Promise<Partial<Record<CrewKey, CrewProfile>>> {
  const { data: rows } = await db
    .from('profiles')
    .select('id, crew_role, points, species_count, updated_at')
    .eq('is_bot', true)
    .not('crew_role', 'is', null);
  const out: Partial<Record<CrewKey, CrewProfile>> = {};
  for (const r of rows ?? []) if ((CREW_KEYS as string[]).includes(r.crew_role)) out[r.crew_role as CrewKey] = r as CrewProfile;

  for (const key of CREW_KEYS) {
    if (out[key] || opts.dry) continue;
    const created = await db.auth.admin.createUser({
      email: email(key),
      password: randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { displayName: CREW[key].name, crew: key, ageBracket: 'adult' },
    });
    const id = created.data.user?.id ?? (await findUserId(db, email(key)));
    if (!id) throw new Error(`could not create ${CREW[key].name}: ${created.error?.message}`);
    const row = {
      id,
      display_name: CREW[key].name,
      avatar_url: `${SITE_URL}/img/crew/${key}.png`,
      is_bot: true,
      crew_role: key,
      points: 0,
      species_count: 0,
      updated_at: new Date(Date.now() - 86_400_000).toISOString(),
    };
    const { error } = await db.from('profiles').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`profile for ${CREW[key].name}: ${error.message}`);
    out[key] = row;
    log('crew_created', { crew: key });
  }
  return out;
}

// True if the companion has already commented on the post (max one each post).
export async function hasCrewComment(db: SupabaseClient, postId: string, crewIds: string[]): Promise<boolean> {
  if (!crewIds.length) return false;
  const { count } = await db
    .from('post_comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId)
    .in('user_id', crewIds);
  return (count ?? 0) > 0;
}

// Remove the earlier Field Crew bot accounts (Dr. Hoot, Moss, Magpie, Kestrel).
// Deleting the auth user cascades to its profile and comments.
export async function retireOldCrew(db: SupabaseClient, opts: { dry?: boolean } = {}): Promise<string[]> {
  const { data: rows } = await db
    .from('profiles')
    .select('id, crew_role')
    .eq('is_bot', true)
    .in('crew_role', [...RETIRED_CREW]);
  const removed: string[] = [];
  for (const r of rows ?? []) {
    if (!opts.dry) {
      const { error } = await db.auth.admin.deleteUser(r.id);
      if (error) {
        log('crew_retire_error', { crew: r.crew_role, detail: error.message });
        continue;
      }
    }
    removed.push(r.crew_role);
  }
  if (removed.length) log('crew_retired', { crew: removed, dry: Boolean(opts.dry) });
  return removed;
}
