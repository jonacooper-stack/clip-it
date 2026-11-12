import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Sighting } from '@/types';
import { deletePhoto } from '@/lib/photoStore';

interface JournalState {
  hasHydrated: boolean;
  sightings: Sighting[];
  setHasHydrated: (v: boolean) => void;
  addSighting: (s: Sighting) => void;
  updateSighting: (id: string, patch: Partial<Sighting>) => void;
  removeSighting: (id: string) => void;
  reset: () => void;
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      sightings: [],
      setHasHydrated: (v) => set({ hasHydrated: v }),
      addSighting: (s) => set((st) => ({ sightings: [s, ...st.sightings] })),
      updateSighting: (id, patch) =>
        set((st) => ({
          sightings: st.sightings.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      // Removing a sighting also deletes its photo file from the device.
      removeSighting: (id) =>
        set((st) => {
          const gone = st.sightings.find((s) => s.id === id);
          if (gone?.photoUri) void deletePhoto(gone.photoUri);
          return { sightings: st.sightings.filter((s) => s.id !== id) };
        }),
      reset: () =>
        set((st) => {
          for (const s of st.sightings) if (s.photoUri) void deletePhoto(s.photoUri);
          return { sightings: [] };
        }),
    }),
    {
      name: 'clipit-journal',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hasHydrated, ...rest }) => rest,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

// What counts toward the journal and score is decided in shared/quests.ts
// (one copy for app and server).
export { totalPoints, distinctSpecies } from '../../shared/quests';
