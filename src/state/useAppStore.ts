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
  /**
   * Which version of the age question was answered: 2 = month and year. The
   * first version asked the year only, which could let in a 12-year-old who
   * turns 13 later in the year, so a 13–17 answer from it is asked again.
   */
  ageCheck: number | null;
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
  setAge: (bracket: AgeBracket, isChild: boolean, ageCheck?: number | null) => void;
  setDisplayName: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setSaveToCameraRoll: (v: boolean) => void;
  setShowCrew: (v: boolean) => void;
  setHomeRegion: (r: RegionKey | null) => void;
  setDiscoverable: (v: boolean) => void;
  setAgeBlockedUntil: (t: number | null) => void;
  /** Forget what belongs to the signed-in person (not the device's settings). */
  clearAccount: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      hasOnboarded: false,
      ageBracket: null,
      isChild: false,
      ageCheck: null,
      displayName: 'Explorer',
      avatarUrl: null,
      saveToCameraRoll: true,
      showCrew: true,
      homeRegion: null,
      discoverable: null,
      ageBlockedUntil: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setOnboarded: (v) => set({ hasOnboarded: v }),
      // (Leaving `ageCheck` out keeps the one already known.)
      setAge: (ageBracket, isChild, ageCheck) => set((s) => ({ ageBracket, isChild, ageCheck: ageCheck === undefined ? s.ageCheck : ageCheck })),
      setDisplayName: (displayName) => set({ displayName }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setSaveToCameraRoll: (saveToCameraRoll) => set({ saveToCameraRoll }),
      setShowCrew: (showCrew) => set({ showCrew }),
      setHomeRegion: (homeRegion) => set({ homeRegion }),
      setDiscoverable: (discoverable) => set({ discoverable }),
      setAgeBlockedUntil: (ageBlockedUntil) => set({ ageBlockedUntil }),

      // On sign-out. The next person to sign in on this device must not
      // inherit this one's name, picture, age range or privacy choice.
      clearAccount: () =>
        set({ ageBracket: null, isChild: false, ageCheck: null, displayName: 'Explorer', avatarUrl: null, discoverable: null }),

      reset: () =>
        set({
          hasOnboarded: false,
          ageBracket: null,
          isChild: false,
          ageCheck: null,
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
