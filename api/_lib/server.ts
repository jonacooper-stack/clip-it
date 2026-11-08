// Shared helpers for the Vercel functions: Supabase config, sign-in checks,
// rate limiting, and database clients. (Files under api/_lib aren't endpoints.)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

// Returns the user id for a valid Supabase access token, or null. `onFail`
// receives a short reason for logging.
export async function verifyUser(
  authHeader: string | string[] | undefined,
  onFail: (reason: string, extra?: Record<string, unknown>) => void = () => {},
): Promise<string | null> {
  const token = bearer(authHeader);
  if (!token) {
    onFail('auth_missing_token');
    return null;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      onFail('auth_rejected', { status: r.status });
      return null;
    }
    const user = (await r.json()) as { id?: string };
    return user?.id ?? null;
  } catch (err: any) {
    onFail('auth_check_error', { detail: String(err?.message ?? err).slice(0, 200) });
    return null;
  }
}

// Simple per-key burst limit (per warm serverless instance — a speed bump
// against a runaway client or script, not a hard quota).
const hitsByKey = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  hitsByKey.set(key, hits);
  return hits.length > max;
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
