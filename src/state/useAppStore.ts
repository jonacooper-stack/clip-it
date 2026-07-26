import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgeBracket } from '@/types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

interface AppState {
  hasHydrated: boolean;
  hasOnboarded: boolean;
  ageBracket: AgeBracket | null;
  isChild: boolean;
  displayName: string;
  avatarUrl: string | null;
  streakCount: number;
  lastActiveDate: string | null;
  saveToCameraRoll: boolean;

  setHasHydrated: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setAge: (bracket: AgeBracket, isChild: boolean) => void;
  setDisplayName: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setSaveToCameraRoll: (v: boolean) => void;
  registerActivityToday: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      hasOnboarded: false,
      ageBracket: null,
      isChild: false,
      displayName: 'Explorer',
      avatarUrl: null,
      streakCount: 0,
      lastActiveDate: null,
      saveToCameraRoll: true,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setOnboarded: (v) => set({ hasOnboarded: v }),
      setAge: (ageBracket, isChild) => set({ ageBracket, isChild }),
      setDisplayName: (displayName) => set({ displayName }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setSaveToCameraRoll: (saveToCameraRoll) => set({ saveToCameraRoll }),

      registerActivityToday: () => {
        const today = todayStr();
        const last = get().lastActiveDate;
        if (last === today) return;
        let streak = 1;
        if (last && daysBetween(last, today) === 1) streak = get().streakCount + 1;
        set({ streakCount: streak, lastActiveDate: today });
      },

      reset: () =>
        set({
          hasOnboarded: false,
          ageBracket: null,
          isChild: false,
          displayName: 'Explorer',
          avatarUrl: null,
          streakCount: 0,
          lastActiveDate: null,
          saveToCameraRoll: true,
        }),
    }),
    {
      name: 'clipit-app',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hasHydrated, ...rest }) => rest,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
