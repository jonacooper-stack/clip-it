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
  };
  const app = useAppStore.getState();
  if (meta.displayName && meta.displayName !== app.displayName) app.setDisplayName(meta.displayName);
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

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
