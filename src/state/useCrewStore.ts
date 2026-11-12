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
  sci?: string;
  emoji: string;
  title: string; // what the animal is up to, e.g. "Trout are laying eggs"
  facts: string[]; // what's happening, where to look, a fun fact (emoji first)
  photos: CrewPhoto[]; // one per slide when we have them
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
  photos?: CrewPhoto[]; // more photos of the same animal, one per slide
  facts: string[];
  tip: string;
}

// Scout's deeper story behind a post (tap "Read the story").
export interface StoryPage {
  heading: string;
  emoji: string;
  text: string;
  photo?: CrewPhoto | null;
}
export interface Story {
  key: string;
  kind: 'theme' | 'species';
  title: string;
  species: string;
  pages: StoryPage[];
  fetchedAt?: number;
}

// Scout's "explorers you might like" (refreshed weekly).
export interface SuggestedPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
  reason: string;
  near: boolean;
  shared: number;
  posts: { postId: string; photoUrl: string; commonName: string | null; likes: number; createdAt: string }[];
}
export interface PeopleSuggestions {
  fetchedAt: number;
  people: SuggestedPerson[];
}

interface CrewState {
  forecasts: Record<string, Forecast>; // key: `${region}:${weekOf}`
  today: Record<string, TodayPick>; // key: `${region}:${date}`
  people: PeopleSuggestions | null;
  followed: string[]; // people followed from Scout's suggestions
  stories: Record<string, Story>; // key: storyId (see lib/crew/api)
  hiddenPhotos: string[]; // photos this player reported (hidden right away)
  saveForecast: (f: Forecast) => void;
  saveToday: (t: TodayPick) => void;
  savePeople: (p: PeopleSuggestions) => void;
  setFollowed: (userId: string, on: boolean) => void;
  saveStory: (id: string, s: Story) => void;
  hidePhoto: (url: string) => void;
  /** Forget everything cached (on sign-out / account deletion): suggestions and
   *  follows belong to the account that was signed in. It all refetches. */
  reset: () => void;
}

export const useCrewStore = create<CrewState>()(
  persist(
    (set) => ({
      forecasts: {},
      today: {},
      people: null,
      followed: [],
      stories: {},
      hiddenPhotos: [],
      reset: () => set({ forecasts: {}, today: {}, people: null, followed: [], stories: {}, hiddenPhotos: [] }),
      saveStory: (id, story) =>
        set((s) => {
          const entries = Object.entries({ ...s.stories, [id]: { ...story, fetchedAt: Date.now() } })
            .sort(([, a], [, b]) => (b.fetchedAt ?? 0) - (a.fetchedAt ?? 0))
            .slice(0, 30);
          return { stories: Object.fromEntries(entries) };
        }),
      hidePhoto: (url) => set((s) => ({ hiddenPhotos: [...new Set([...s.hiddenPhotos, url])].slice(-300) })),
      savePeople: (people) => set({ people }),
      setFollowed: (userId, on) =>
        set((s) => ({ followed: on ? [...new Set([...s.followed, userId])].slice(-200) : s.followed.filter((x) => x !== userId) })),
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
      // v4: photos are now checked before use. Drop older content (it refetches),
      // keeping who the player followed.
      version: 4,
      migrate: (old: any) => ({ forecasts: {}, today: {}, people: null, followed: old?.followed ?? [], stories: {}, hiddenPhotos: [] }) as any,
    },
  ),
);
