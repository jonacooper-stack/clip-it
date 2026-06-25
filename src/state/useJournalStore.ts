import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Sighting } from '@/types';

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
      removeSighting: (id) =>
        set((st) => ({ sightings: st.sightings.filter((s) => s.id !== id) })),
      reset: () => set({ sightings: [] }),
    }),
    {
      name: 'clipit-journal',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hasHydrated, ...rest }) => rest,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

// Sightings that don't count toward the journal or score: no animal, or an
// identified-but-ineligible subject (a pet or a person).
const UNCOUNTED: ReadonlySet<string> = new Set(['rejected', 'ineligible']);

// Derived selectors (compute in components from `sightings` for reactivity).
export function totalPoints(sightings: Sighting[]): number {
  return sightings
    .filter((s) => !UNCOUNTED.has(s.idStatus) && typeof s.points === 'number')
    .reduce((sum, s) => sum + (s.points ?? 0), 0);
}

export function distinctSpecies(sightings: Sighting[]): Sighting[] {
  const byName = new Map<string, Sighting>();
  for (const s of sightings) {
    if (!s.species || UNCOUNTED.has(s.idStatus)) continue;
    if (!byName.has(s.species.scientificName)) byName.set(s.species.scientificName, s);
  }
  return [...byName.values()];
}
