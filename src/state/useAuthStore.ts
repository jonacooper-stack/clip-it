import { Platform } from 'react-native';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from './useAppStore';
import type { AgeBracket } from '@/types';

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
  signOut: () => Promise<void>;
}

let subscribed = false;

// Pull displayName / ageBracket off the account into the local store the UI reads.
function syncMetadata(session: Session | null) {
  if (!session) return;
  const meta = (session.user.user_metadata ?? {}) as {
    displayName?: string;
    ageBracket?: AgeBracket;
    isChild?: boolean;
    full_name?: string;
    name?: string;
  };
  const app = useAppStore.getState();
  // OAuth providers (Google) supply full_name/name instead of our displayName.
  const name = meta.displayName || meta.full_name || meta.name;
  if (name && name !== app.displayName) app.setDisplayName(name);
  if (meta.ageBracket && meta.ageBracket !== app.ageBracket) {
    app.setAge(meta.ageBracket, Boolean(meta.isChild));
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  initialized: !isSupabaseConfigured,

  init: () => {
    if (!supabase || subscribed) return;
    subscribed = true;
    supabase.auth.getSession().then(({ data }) => {
      syncMetadata(data.session);
      set({ session: data.session, initialized: true });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      syncMetadata(session);
      set({ session });
    });
  },

  signUp: async ({ email, password, displayName, ageBracket, isChild }) => {
    if (!supabase) return { error: 'Accounts are not set up yet.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { displayName: displayName.trim(), ageBracket, isChild } },
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
    // Web: redirect back to the current origin, where detectSessionInUrl picks up
    // the session. (Native deep-linking is wired when the native app is built.)
    const redirectTo = typeof window !== 'undefined' ? (window as any).location?.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) return { error: error.message };
    return {};
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
