// Account deletion.
//
// App Store Review Guideline 5.1.1(v): an app that lets you create an account
// must let you delete it from inside the app. Deletion has to happen server-side
// — removing an auth user needs the service-role key, which must never ship in
// the app — so this calls api/delete-account.ts with the user's own access token
// and that endpoint verifies the token before deleting anything.

import { supabase } from './supabase';
import { useAuthStore } from '@/state/useAuthStore';

// The delete endpoint lives beside the identify one on Vercel. Derive it from
// the configured identify URL so a single env var keeps pointing at the right
// deployment, with an explicit override when they're hosted apart.
function deleteAccountUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL;
  if (explicit) return explicit;
  const identify = process.env.EXPO_PUBLIC_IDENTIFY_URL ?? '/api/identify';
  return identify.replace(/\/api\/identify\/?$/, '/api/delete-account');
}

export async function deleteMyAccount(): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Accounts are not set up yet.' };

  // Read the token fresh rather than from the store: the cached session may have
  // expired, and getSession() refreshes it first.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'Sign in again, then try deleting your account.' };

  let res: Response;
  try {
    res = await fetch(deleteAccountUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    return { error: 'Couldn’t reach the server. Check your connection and try again.' };
  }

  if (!res.ok) {
    // The endpoint answers with JSON, but a proxy or a cold start can return HTML;
    // don't surface a page of markup as the error message.
    let message = `Couldn’t delete the account (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error) message = String(body.error);
    } catch {
      // keep the status-code message
    }
    return { error: message };
  }

  // The account is gone; drop the local session so the app returns to onboarding.
  await useAuthStore.getState().signOut();
  return {};
}
