import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgeBracket } from '@/types';
import type { RegionKey } from '../../shared/crew';

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
  /** Show Scout (the AI companion, always labeled) in the feed and comments. */
  showCrew: boolean;
  /** Where the player usually explores; drives Scout's daily posts. */
  homeRegion: RegionKey | null;

  setHasHydrated: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setAge: (bracket: AgeBracket, isChild: boolean) => void;
  setDisplayName: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setSaveToCameraRoll: (v: boolean) => void;
  setShowCrew: (v: boolean) => void;
  setHomeRegion: (r: RegionKey | null) => void;
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
      showCrew: true,
      homeRegion: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setOnboarded: (v) => set({ hasOnboarded: v }),
      setAge: (ageBracket, isChild) => set({ ageBracket, isChild }),
      setDisplayName: (displayName) => set({ displayName }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setSaveToCameraRoll: (saveToCameraRoll) => set({ saveToCameraRoll }),
      setShowCrew: (showCrew) => set({ showCrew }),
      setHomeRegion: (homeRegion) => set({ homeRegion }),

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
          showCrew: true,
          homeRegion: null,
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
