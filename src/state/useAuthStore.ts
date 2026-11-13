import { Platform } from 'react-native';
import { create } from 'zustand';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from './useAppStore';
import type { AgeBracket } from '@/types';
import { regionByKey, type RegionKey } from '../../shared/crew';
import { AGE_CHECK_VERSION } from '../../shared/age';

// Pull OAuth tokens (or an auth code) out of the deep-link the browser returns —
// they can arrive in the URL's query (?...) or fragment (#...) depending on flow.
function paramsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  for (const part of [query, hash]) {
    for (const kv of part.split('&')) {
      if (!kv) continue;
      const [k, v] = kv.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
  }
  return out;
}

// Auth is a thin layer over Supabase: Supabase owns the session (persisted to
// AsyncStorage by the client), and we mirror the user's display name + age
// bracket from `user_metadata` into useAppStore so the rest of the UI keeps
// reading the local store unchanged. When Supabase isn't configured the whole
// layer is inert and the app runs local-only, exactly as before.

interface SignUpArgs {
  email: string;
  password: string;
  displayName: string;
  ageBracket: AgeBracket | null;
  isChild: boolean;
}

interface AuthState {
  session: Session | null;
  // True once we know whether a session exists (or immediately, if unconfigured),
  // so the splash gate doesn't flash the wrong screen on cold start.
  initialized: boolean;
  init: () => void;
  signUp: (a: SignUpArgs) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInWithApple: () => Promise<{ error?: string; cancelled?: boolean }>;
  signOut: () => Promise<void>;
}

let subscribed = false;
// Age answers we've already tried to save on the account (once each per
// launch, unless the attempt fails).
const ageSaved = new Set<string>();
// The account the age question was last answered for while signed in to it.
// Only such an answer may replace one the account already has: an answer
// typed before signing in may be someone else's (a parent answering on a
// shared phone, then signing in to their child's account).
let answeredFor: string | null = null;

// The session to sync once the local store has loaded from disk.
let awaitingHydration: Session | null = null;
let hydrationHooked = false;

// Pull displayName / ageBracket off the account into the local store the UI reads.
function syncMetadata(session: Session | null) {
  if (!session) return;
  // The local store loads from disk a moment after launch, and loading
  // replaces whatever is in it: wait for that, or the values copied from the
  // account here would be overwritten by the saved ones (and a signed-in
  // player could be asked for their birth year again).
  if (!useAppStore.persist.hasHydrated()) {
    awaitingHydration = session;
    if (!hydrationHooked) {
      hydrationHooked = true;
      useAppStore.persist.onFinishHydration(() => {
        const s = awaitingHydration;
        awaitingHydration = null;
        syncMetadata(s);
      });
    }
    return;
  }
  const meta = (session.user.user_metadata ?? {}) as {
    displayName?: string;
    ageBracket?: AgeBracket;
    isChild?: boolean;
    ageCheck?: number;
    full_name?: string;
    name?: string;
    homeRegion?: string;
  };
  const app = useAppStore.getState();
  // OAuth providers (Google) supply full_name/name instead of our displayName.
  const name = meta.displayName || meta.full_name || meta.name;
  if (name && name !== app.displayName) app.setDisplayName(name);
  // The age answer (the range, and which version of the question it came
  // from: see shared/age.ts) lives on the account and is mirrored here.
  const accountCheck = typeof meta.ageCheck === 'number' ? meta.ageCheck : 0;
  const localCheck = app.ageCheck ?? 0;
  const answeredHere =
    Boolean(app.ageBracket) && app.ageBracket !== 'under_13' && (!meta.ageBracket || (localCheck > accountCheck && answeredFor === session.user.id));
  if (answeredHere) {
    // Answered on this device and not on the account yet (a Google or Apple
    // sign-in never saved it, or the question was just answered again with
    // the month): save it, so the account's other devices and the server
    // know. Nothing from the journal is saved to the account before this.
    const key = `${session.user.id}:${localCheck}`;
    if (supabase && !ageSaved.has(key)) {
      ageSaved.add(key);
      // (updateUser reports a failure in its answer rather than by throwing:
      // either way it is tried again next time.)
      supabase.auth.updateUser({ data: { ageBracket: app.ageBracket, isChild: false, ageCheck: localCheck || undefined } }).then(
        ({ error }) => {
          if (error) ageSaved.delete(key);
        },
        () => ageSaved.delete(key),
      );
    }
  } else if (meta.ageBracket && (meta.ageBracket !== app.ageBracket || accountCheck !== localCheck)) {
    app.setAge(meta.ageBracket, Boolean(meta.isChild), accountCheck || null);
  }
  // Home region picked on another device.
  if (meta.homeRegion && !app.homeRegion && regionByKey(meta.homeRegion)) app.setHomeRegion(meta.homeRegion as RegionKey);
}

function forgetAccount() {
  awaitingHydration = null;
  answeredFor = null;
  useAppStore.getState().clearAccount();
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  initialized: !isSupabaseConfigured,

  init: () => {
    if (!supabase || subscribed) return;
    subscribed = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        syncMetadata(data.session);
        set({ session: data.session, initialized: true });
      })
      // Never leave the launch spinner up forever (e.g. a storage read error):
      // fall through to signed-out and let the user sign in again.
      .catch(() => set({ session: null, initialized: true }));
    supabase.auth.onAuthStateChange((event, session) => {
      // Signed out (here, or because the session ended): forget this person's
      // profile on the device, so the next account doesn't inherit their name,
      // age range or privacy choice.
      if (event === 'SIGNED_OUT') forgetAccount();
      syncMetadata(session);
      set({ session });
    });
  },

  signUp: async ({ email, password, displayName, ageBracket, isChild }) => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // (The version of the age question that was answered: an answer left
      // on the phone by an older version, which asked the year only, isn't
      // passed off as the current one.)
      options: { data: { displayName: displayName.trim(), ageBracket, isChild, ageCheck: useAppStore.getState().ageCheck ?? undefined } },
    });
    if (error) return { error: error.message };
    // No session means the project requires email confirmation before sign-in.
    if (!data.session) return { needsConfirmation: true };
    return {};
  },

  signIn: async (email, password) => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: error.message };
    return {};
  },

  signInWithGoogle: async () => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };

    // Web: full-page redirect back to the origin, where detectSessionInUrl picks
    // up the session on reload.
    if (Platform.OS === 'web') {
      // Return to the app's feed, not "/" (the marketing landing page). The
      // Supabase Redirect URLs list must allow it (e.g. https://clipitwildlife.app/**).
      const redirectTo = typeof window !== 'undefined' ? `${(window as any).location?.origin}/feed` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      return error ? { error: error.message } : {};
    }

    // Native: open Google in a system auth browser, then complete the session from
    // the deep-link it redirects back to (clipit://auth/callback). That URL must be
    // allow-listed in Supabase → Authentication → URL Configuration → Redirect URLs.
    try {
      const redirectTo = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Could not start Google sign-in.' };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) return {}; // dismissed/cancelled — no error

      const p = paramsFromUrl(result.url);
      if (p.access_token && p.refresh_token) {
        const { error: sErr } = await supabase.auth.setSession({
          access_token: p.access_token,
          refresh_token: p.refresh_token,
        });
        if (sErr) return { error: sErr.message };
      } else if (p.code) {
        const { error: cErr } = await supabase.auth.exchangeCodeForSession(p.code);
        if (cErr) return { error: cErr.message };
      } else {
        return { error: p.error_description || p.error || 'Google sign-in didn’t return a session.' };
      }
      return {};
    } catch (e: any) {
      return { error: String(e?.message ?? e) };
    }
  },

  // Native Sign in with Apple (iOS only; App Store Guideline 4.8 requires it
  // alongside Google). Apple returns a signed identity token that Supabase
  // verifies directly — no browser hop. Requires the Apple provider enabled in
  // Supabase → Authentication → Providers, with the bundle id
  // (com.clipitwildlife.app) listed under "Client IDs".
  signInWithApple: async () => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };
    if (Platform.OS !== 'ios') return { error: 'Sign in with Apple is available on iPhone and iPad.' };
    try {
      // Apple embeds the SHA-256 of the nonce in the token; Supabase checks the
      // raw nonce against it, which prevents token replay.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!cred.identityToken) return { error: 'Apple didn’t return a sign-in token. Please try again.' };

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: cred.identityToken,
        nonce: rawNonce,
      });
      if (error) return { error: error.message };

      // Apple shares the name only on the very first sign-in, and never puts it
      // in the token — save it (plus the age range picked during onboarding) on
      // the account so it survives reinstalls. Never overwrite existing values.
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ').trim();
      if (fullName && !meta.full_name && !meta.displayName) patch.full_name = fullName;
      const app = useAppStore.getState();
      if (!meta.ageBracket && app.ageBracket) {
        patch.ageBracket = app.ageBracket;
        patch.isChild = app.isChild;
        if (app.ageCheck) patch.ageCheck = app.ageCheck;
      }
      if (Object.keys(patch).length) {
        const { data: upd } = await supabase.auth.updateUser({ data: patch });
        if (upd?.user) syncMetadata({ ...(data.session as Session), user: upd.user });
      }
      return {};
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
      return { error: String(e?.message ?? e) };
    }
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    forgetAccount();
    set({ session: null });
  },
}));

// Re-check the signed-in account against the local profile right now: used
// after the age check is answered while already signed in, so the age range
// is saved on the account straight away (see syncMetadata).
// The age question has just been answered (or the server says the account
// still lacks the answer): save it on the signed-in account now.
export function syncAccountNow(): void {
  const session = useAuthStore.getState().session;
  answeredFor = session?.user.id ?? null;
  syncMetadata(session);
}
