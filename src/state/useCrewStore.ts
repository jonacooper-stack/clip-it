import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrewPhoto } from '@/types';

// Scout's weekly forecasts, cached on the device by region + week so the inbox
// and feed strip work offline and the server is asked at most once a week.

export interface ForecastItem {
  group: 'bird' | 'mammal' | 'fish' | 'reptile' | 'amphibian' | 'insect' | 'other';
  species: string;
  title: string;
  body: string;
  where: string;
  photo?: CrewPhoto | null;
}

export interface Forecast {
  region: string;
  weekOf: string;
  headline: string;
  items: ForecastItem[];
}

interface CrewState {
  forecasts: Record<string, Forecast>; // key: `${region}:${weekOf}`
  saveForecast: (f: Forecast) => void;
}

export const useCrewStore = create<CrewState>()(
  persist(
    (set) => ({
      forecasts: {},
      saveForecast: (f) =>
        set((s) => {
          // Keep only the latest few weeks.
          const entries = Object.entries({ ...s.forecasts, [`${f.region}:${f.weekOf}`]: f })
            .sort(([, a], [, b]) => b.weekOf.localeCompare(a.weekOf))
            .slice(0, 6);
          return { forecasts: Object.fromEntries(entries) };
        }),
    }),
    { name: 'clipit-crew', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
