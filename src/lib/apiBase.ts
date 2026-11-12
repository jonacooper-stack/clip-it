// Where the app's own server lives, and how to sign a request to it.
// The server is the one that serves the identify endpoint: same-origin on the
// web, an absolute address on the phone.
import { Platform } from 'react-native';
import { supabase } from './supabase';

const IDENTIFY_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL ?? '/api/identify';
export const API_BASE = Platform.OS === 'web' ? '' : IDENTIFY_URL.replace(/\/api\/identify\/?$/, '');
export const hasServer = Platform.OS === 'web' || /^https?:\/\//i.test(API_BASE);

// The Authorization header for the signed-in player, or null when signed out.
export async function authHeaders(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

// The player's time zone by name ("Europe/Paris"), if the device can say.
// Weekly quests run Monday to Sunday in the player's own zone, and the server
// works out their rewards, so it needs to know which zone that is.
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
