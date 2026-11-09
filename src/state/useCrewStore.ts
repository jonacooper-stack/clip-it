import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrewPhoto } from '@/types';

// Scout's content, cached on the device: the weekly "near you" slides (by
// region + week) and the animal of the day (by region + local date), so the
// feed works offline and the server is asked at most once a week / day.

export interface ForecastItem {
  group: 'bird' | 'mammal' | 'fish' | 'reptile' | 'amphibian' | 'insect' | 'other';
  species: string;
  emoji: string;
  title: string; // what the animal is up to, e.g. "Trout are laying eggs"
  fact: string; // one short sentence
  photo?: CrewPhoto | null;
}

export interface Forecast {
  region: string;
  weekOf: string;
  headline: string;
  items: ForecastItem[];
}

// Scout's animal of the day (one per region per local date).
export interface TodayPick {
  region: string;
  date: string; // local YYYY-MM-DD
  species: string;
  sci: string;
  photo: CrewPhoto;
  facts: string[];
  tip: string;
}

interface CrewState {
  forecasts: Record<string, Forecast>; // key: `${region}:${weekOf}`
  today: Record<string, TodayPick>; // key: `${region}:${date}`
  saveForecast: (f: Forecast) => void;
  saveToday: (t: TodayPick) => void;
}

export const useCrewStore = create<CrewState>()(
  persist(
    (set) => ({
      forecasts: {},
      today: {},
      saveToday: (t) =>
        set((s) => {
          // Keep the last two weeks so they stay in the feed's history.
          const entries = Object.entries({ ...s.today, [`${t.region}:${t.date}`]: t })
            .sort(([, a], [, b]) => b.date.localeCompare(a.date))
            .slice(0, 14);
          return { today: Object.fromEntries(entries) };
        }),
      saveForecast: (f) =>
        set((s) => {
          // Keep only the latest few weeks.
          const entries = Object.entries({ ...s.forecasts, [`${f.region}:${f.weekOf}`]: f })
            .sort(([, a], [, b]) => b.weekOf.localeCompare(a.weekOf))
            .slice(0, 6);
          return { forecasts: Object.fromEntries(entries) };
        }),
    }),
    {
      name: 'clipit-crew',
      storage: createJSONStorage(() => AsyncStorage),
      // v2: short kid-friendly slides. Drop older long-form content (it refetches).
      version: 2,
      migrate: () => ({ forecasts: {}, today: {} }) as any,
    },
  ),
);
