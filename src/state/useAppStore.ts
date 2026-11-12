import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgeBracket } from '@/types';
import type { RegionKey } from '../../shared/crew';

// (The day streak isn't stored here: it's worked out from the journal, see
// lib/streak.)
interface AppState {
  hasHydrated: boolean;
  hasOnboarded: boolean;
  ageBracket: AgeBracket | null;
  isChild: boolean;
  displayName: string;
  avatarUrl: string | null;
  saveToCameraRoll: boolean;
  /** Show Scout (the AI companion, always labeled) in the feed and comments. */
  showCrew: boolean;
  /** Where the player usually explores; drives Scout's daily posts. */
  homeRegion: RegionKey | null;
  /** Whether Scout may suggest this player to others (null = not chosen yet:
   *  on for adults, off for ages 13–17). */
  discoverable: boolean | null;
  /** Set when someone under 13 tried to sign up on this device: the age gate
   *  stays closed until this time (so a different year can't simply be
   *  entered straight away). */
  ageBlockedUntil: number | null;

  setHasHydrated: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setAge: (bracket: AgeBracket, isChild: boolean) => void;
  setDisplayName: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setSaveToCameraRoll: (v: boolean) => void;
  setShowCrew: (v: boolean) => void;
  setHomeRegion: (r: RegionKey | null) => void;
  setDiscoverable: (v: boolean) => void;
  setAgeBlockedUntil: (t: number | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      hasOnboarded: false,
      ageBracket: null,
      isChild: false,
      displayName: 'Explorer',
      avatarUrl: null,
      saveToCameraRoll: true,
      showCrew: true,
      homeRegion: null,
      discoverable: null,
      ageBlockedUntil: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setOnboarded: (v) => set({ hasOnboarded: v }),
      setAge: (ageBracket, isChild) => set({ ageBracket, isChild }),
      setDisplayName: (displayName) => set({ displayName }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setSaveToCameraRoll: (saveToCameraRoll) => set({ saveToCameraRoll }),
      setShowCrew: (showCrew) => set({ showCrew }),
      setHomeRegion: (homeRegion) => set({ homeRegion }),
      setDiscoverable: (discoverable) => set({ discoverable }),
      setAgeBlockedUntil: (ageBlockedUntil) => set({ ageBlockedUntil }),

      reset: () =>
        set({
          hasOnboarded: false,
          ageBracket: null,
          isChild: false,
          displayName: 'Explorer',
          avatarUrl: null,
          saveToCameraRoll: true,
          showCrew: true,
          homeRegion: null,
          discoverable: null,
          ageBlockedUntil: null,
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
