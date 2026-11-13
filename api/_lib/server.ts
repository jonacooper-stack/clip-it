// Shared helpers for the Vercel functions: Supabase config, sign-in checks,
// rate limiting, and database clients. (Files under api/_lib aren't endpoints.)
import { createHash, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicStorageUrl } from '../../shared/storage';
import { ageIsSettled } from '../../shared/age';

// The app's public project URL + publishable key (also in eas.json),
// overridable via Vercel env vars.
export const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://oybkykeoatfgcfqgaqpl.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_yq-VQEcUYjYAHDlYqd_4jQ_CFxawxdY';
export const SITE_URL = (process.env.SITE_URL || 'https://clipitwildlife.app').replace(/\/$/, '');

// One JSON line per event, for Vercel → Logs. Never log tokens or image data.
export function log(event: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...extra }));
}

export function bearer(authHeader: string | string[] | undefined): string | null {
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  return h?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

// Compare two secrets without leaking, through timing, how much of one matched.
export function safeEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

// Tokens checked in the last minute (by hash, never the token itself), so a
// burst of requests from one player (a rapid-fire queue draining) asks
// Supabase once instead of once per request.
const verified = new Map<string, { userId: string; ageCleared: boolean; until: number }>();
const VERIFY_TTL_MS = 60_000;

// ClipIt is for ages 13 and up, and nothing from a journal is saved to an
// account until the account carries the answer to the age question (the rule
// is in shared/age.ts). The app writes the answer to the account when the
// question is answered.
export function ageCleared(metadata: unknown): boolean {
  const m = (metadata ?? {}) as { ageBracket?: unknown; ageCheck?: unknown };
  return ageIsSettled(m.ageBracket, m.ageCheck);
}

export interface Player {
  userId: string;
  /** The account has answered the age question (see ageCleared). */
  ageCleared: boolean;
}

// The account a valid Supabase access token belongs to, or null. `onFail`
// receives a short reason for logging. `freshAge`: don't settle for a
// remembered "hasn't answered the age question" (the app may just have
// saved the answer).
export async function verifyPlayer(
  authHeader: string | string[] | undefined,
  onFail: (reason: string, extra?: Record<string, unknown>) => void = () => {},
  opts: { freshAge?: boolean } = {},
): Promise<Player | null> {
  const token = bearer(authHeader);
  if (!token) {
    onFail('auth_missing_token');
    return null;
  }
  const key = createHash('sha256').update(token).digest('base64');
  const now = Date.now();
  const hit = verified.get(key);
  if (hit && hit.until > now && (hit.ageCleared || !opts.freshAge)) return { userId: hit.userId, ageCleared: hit.ageCleared };
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      onFail('auth_rejected', { status: r.status });
      return null;
    }
    const user = (await r.json()) as { id?: string; user_metadata?: unknown };
    if (!user?.id) return null;
    const player: Player = { userId: user.id, ageCleared: ageCleared(user.user_metadata) };
    if (verified.size > 5000) for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
    verified.set(key, { ...player, until: now + VERIFY_TTL_MS });
    return player;
  } catch (err: any) {
    onFail('auth_check_error', { detail: String(err?.message ?? err).slice(0, 200) });
    return null;
  }
}

// Returns the user id for a valid Supabase access token, or null.
export async function verifyUser(
  authHeader: string | string[] | undefined,
  onFail: (reason: string, extra?: Record<string, unknown>) => void = () => {},
): Promise<string | null> {
  return (await verifyPlayer(authHeader, onFail))?.userId ?? null;
}

// Simple per-key burst limit (per warm serverless instance — a speed bump
// against a runaway client or script, not a hard quota; see dailyLimitReached
// for the one that holds across instances).
const hitsByKey = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  hitsByKey.set(key, hits);
  // Drop idle keys now and then so a long-lived instance doesn't keep every
  // player it has ever seen.
  if (hitsByKey.size > 5000) for (const [k, v] of hitsByKey) if (!v.length || now - v[v.length - 1] > windowMs) hitsByKey.delete(k);
  return hits.length > max;
}

// ---------- daily limits (per player, across all server instances) ----------
// Everything here spends AI credit, and anyone can create an account, so each
// player gets a daily allowance that no real player comes near. Counted in the
// database (table usage_counters, migration 0010) because the in-memory limit
// above resets with every new server instance. Tune with Vercel environment
// variables.
const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const DAILY_LIMITS = {
  identify: limit('DAILY_IDENTIFY_LIMIT', 300), // photos identified
  generate: limit('DAILY_GENERATE_LIMIT', 60), // new Scout facts / stories written because of this player
  flag: limit('DAILY_FLAG_LIMIT', 20), // photos reported
  journal: limit('DAILY_JOURNAL_LIMIT', 600), // journal sync requests (each carries up to 40 sightings)
  score: limit('DAILY_SCORE_LIMIT', 100), // sightings that may score in a day (more are still identified)
  refused: limit('DAILY_REFUSED_LIMIT', 10), // photos turned down as not the player's own before scoring pauses for the day
} as const;

let warnedNoCounters = false;

// Seconds until the daily allowances reset (the counters are per UTC day).
export function secondsToUtcMidnight(now = Date.now()): number {
  return Math.max(60, Math.ceil((86_400_000 - (now % 86_400_000)) / 1000));
}

// Count one use and say whether the player is now over today's allowance.
// Without the service key or the migration there is nothing to count in, so it
// allows the request (and says so once in the logs).
export async function dailyLimitReached(db: SupabaseClient | null, userId: string, kind: keyof typeof DAILY_LIMITS): Promise<boolean> {
  if (!db) return false;
  const { data, error } = await db.rpc('bump_usage', { p_user: userId, p_kind: kind });
  if (error) {
    if (!warnedNoCounters) {
      warnedNoCounters = true;
      log('daily_limits_unavailable', { detail: error.message.slice(0, 160) });
    }
    return false;
  }
  return Number(data) > DAILY_LIMITS[kind];
}

// How many times something has been counted for a player today, without
// adding to it. (0 when the counters can't be read.)
export async function usedToday(db: SupabaseClient | null, userId: string, kind: keyof typeof DAILY_LIMITS): Promise<number> {
  if (!db) return 0;
  const day = new Date().toISOString().slice(0, 10); // the counters are per UTC day
  const { data, error } = await db.from('usage_counters').select('count').eq('user_id', userId).eq('day', day).eq('kind', kind).maybeSingle();
  return error ? 0 : Number((data as any)?.count ?? 0);
}

// Photo and avatar links in the database are written by the app that posted
// them. Only pass on links into our own public storage (the app applies the
// same rule, shared/storage): anything else could point at a server that logs
// who looks.
export function ownStorageUrl(url: unknown, bucket: 'feed-photos' | 'avatars'): string | null {
  return publicStorageUrl(url, SUPABASE_URL, bucket);
}

// Service-role client (bypasses RLS) — only when SUPABASE_SERVICE_ROLE_KEY is
// set in Vercel. Callers must degrade gracefully when it's null.
export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// A client that acts as the signed-in player (RLS applies).
export function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
