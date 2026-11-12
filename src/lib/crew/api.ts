// Talking to Scout's server endpoints (api/crew/*). Everything here is
// best-effort: if the network or server is down, Scout simply has less to say,
// and nothing else in the app is affected.
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { API_BASE, authHeaders, hasServer } from '@/lib/apiBase';
import { useJournalStore } from '@/state/useJournalStore';
import { useCrewStore, type Forecast, type PeopleSuggestions, type Story, type TodayPick } from '@/state/useCrewStore';
import { useAppStore } from '@/state/useAppStore';
import type { CrewNotes, Sighting } from '@/types';
import { weekOf, type RegionKey } from '../../../shared/crew';


async function crewFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T | null> {
  if (!hasServer) return null;
  const auth = await authHeaders();
  if (!auth) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...auth, ...(init.headers as Record<string, string>) },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const inFlight = new Set<string>();

// Notes saved before this version (long-form facts) are refetched.
export const NOTES_VERSION = 4;
const fresh = (n?: CrewNotes) => Boolean(n && n.v === NOTES_VERSION && Date.now() - n.fetchedAt < 7 * 86_400_000);

// Fetch Scout's facts + other players' photos for a sighting and save them on
// it. Reuses notes from another sighting of the same species fetched in the
// last week (no server call). With `postId`, also asks Scout to comment on the
// wall post the player just shared.
export async function fetchCrewNotes(sightingId: string, opts: { postId?: string } = {}): Promise<CrewNotes | null> {
  const store = useJournalStore.getState();
  const s = store.sightings.find((x) => x.id === sightingId);
  if (!s?.species?.commonName || s.idStatus === 'rejected' || s.idStatus === 'ineligible') return null;
  const key = `${sightingId}:${opts.postId ?? ''}`;
  if (inFlight.has(key)) return s.crew ?? null;

  if (!opts.postId) {
    if (fresh(s.crew)) return s.crew!;
    const twin = store.sightings.find((x) => x.id !== sightingId && fresh(x.crew) && x.species?.commonName === s.species?.commonName);
    if (twin?.crew) {
      store.updateSighting(sightingId, { crew: twin.crew });
      return twin.crew;
    }
  }

  inFlight.add(key);
  try {
    const res = await crewFetch<Omit<CrewNotes, 'fetchedAt'>>('/api/crew/notes', {
      method: 'POST',
      body: JSON.stringify({ species: s.species.commonName, sci: s.species.scientificName || undefined, postId: opts.postId }),
    });
    if (!res || (!res.facts?.length && !res.others?.length && !res.photo)) return s.crew ?? null;
    const notes: CrewNotes = { facts: res.facts ?? [], tip: res.tip ?? '', photos: res.photos ?? [], others: res.others ?? [], photo: res.photo ?? null, v: NOTES_VERSION, fetchedAt: Date.now() };
    useJournalStore.getState().updateSighting(sightingId, { crew: notes });
    return notes;
  } finally {
    inFlight.delete(key);
  }
}

// Scout's "this week near you" slides, from the device cache or the server.
export async function loadForecast(region: RegionKey): Promise<Forecast | null> {
  const week = weekOf();
  const cached = useCrewStore.getState().forecasts[`${region}:${week}`];
  if (cached) return cached;
  const f = await crewFetch<Forecast>(`/api/crew/forecast?region=${encodeURIComponent(region)}`);
  if (f?.items?.length) useCrewStore.getState().saveForecast(f);
  return f;
}

// The player's local date as YYYY-MM-DD (the animal of the day follows the
// player's day, not UTC).
export function localDate(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Scout's animal of the day, from the device cache or the server.
export async function loadToday(region: RegionKey): Promise<TodayPick | null> {
  const date = localDate();
  const cached = useCrewStore.getState().today[`${region}:${date}`];
  if (cached) return cached;
  const t = await crewFetch<TodayPick>(`/api/crew/today?region=${encodeURIComponent(region)}&date=${date}`);
  if (t?.facts?.length && t.photo) useCrewStore.getState().saveToday({ ...t, region, date });
  return t;
}

// Whether Scout may suggest this player to others. Until the player chooses,
// it's on for adults and off for ages 13–17.
export function discoverableSetting(): boolean {
  const { discoverable, ageBracket } = useAppStore.getState();
  return discoverable ?? ageBracket !== '13_17';
}

async function myId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// Save the home region on the account: auth metadata (for the player's other
// devices) and profile_private (for the server; other players can't read it).
// Best-effort.
export async function saveHomeRegion(region: RegionKey): Promise<void> {
  const uid = await myId();
  if (!supabase || !uid) return;
  await Promise.allSettled([
    supabase.auth.updateUser({ data: { homeRegion: region } }),
    supabase.from('profile_private').upsert({ id: uid, home_region: region, discoverable: discoverableSetting(), updated_at: new Date().toISOString() }),
  ]);
}

export async function saveDiscoverable(on: boolean): Promise<void> {
  useAppStore.getState().setDiscoverable(on);
  const uid = await myId();
  if (!supabase || !uid) return;
  await supabase.from('profile_private').upsert({ id: uid, discoverable: on, updated_at: new Date().toISOString() });
}

// Scout's "explorers you might like", refreshed weekly. Sends the names of
// species in the player's journal (never photos or locations) so Scout can
// match people who found the same animals.
export async function loadPeople(force = false): Promise<PeopleSuggestions | null> {
  const cached = useCrewStore.getState().people;
  if (!force && cached && Date.now() - cached.fetchedAt < 7 * 86_400_000) return cached;
  const species = [
    ...new Set(
      useJournalStore
        .getState()
        .sightings.filter((s) => s.species && s.idStatus !== 'rejected' && s.idStatus !== 'ineligible')
        .flatMap((s) => [s.species!.commonName, s.species!.scientificName])
        .filter(Boolean),
    ),
  ].slice(0, 120);
  const res = await crewFetch<{ people: PeopleSuggestions['people'] }>('/api/crew/people', { method: 'POST', body: JSON.stringify({ species }) });
  if (!res) return cached;
  const next = { fetchedAt: Date.now(), people: res.people ?? [] };
  useCrewStore.getState().savePeople(next);
  return next;
}

// ---------- stories ----------

export interface StoryRef {
  kind: 'theme' | 'species';
  species: string;
  sci?: string;
  title?: string;
  region?: string;
  weekOf?: string;
}

export function storyId(r: StoryRef): string {
  return [r.kind, r.region ?? '', r.weekOf ?? '', (r.sci || r.species).toLowerCase(), (r.title ?? '').toLowerCase()].join('|');
}

// A story nobody has opened yet is written on the spot, which can take a
// while; the server allows 60 seconds, so wait nearly that long before giving
// up (the next try is instant once the server has finished it).
const STORY_TIMEOUT_MS = 55_000;
const storiesInFlight = new Map<string, Promise<Story | null>>();

// The deeper story behind a post, from the device cache or the server
// (written once on the server, then shared). Repeat calls while one is in
// flight share the same request.
export function loadStory(r: StoryRef): Promise<Story | null> {
  const id = storyId(r);
  const cached = useCrewStore.getState().stories[id];
  // A copy that went out before its photos were ready is only good for a few minutes.
  const freshFor = cached?.partial ? 10 * 60_000 : 7 * 86_400_000;
  if (cached && Date.now() - (cached.fetchedAt ?? 0) < freshFor) return Promise.resolve(cached);
  const running = storiesInFlight.get(id);
  if (running) return running;
  const request = crewFetch<Story>('/api/crew/story', { method: 'POST', body: JSON.stringify(r) }, STORY_TIMEOUT_MS)
    .then((s) => {
      if (s?.pages?.length) useCrewStore.getState().saveStory(id, s);
      return s?.pages?.length ? s : cached ?? null;
    })
    .finally(() => storiesInFlight.delete(id));
  storiesInFlight.set(id, request);
  return request;
}

// What the player tapped to open a story (the slide's photo and emoji), handed
// to the story screen in memory so it has something to show while the story
// loads. Not part of the URL: a link can't put an arbitrary image on screen.
export interface StoryCover {
  photo?: { uri: string; credit?: string; source?: string };
  emoji?: string;
}
let pendingCover: { id: string; cover: StoryCover } | null = null;

export function setStoryCover(r: StoryRef, cover: StoryCover): void {
  pendingCover = { id: storyId(r), cover };
}

export function storyCover(r: StoryRef): StoryCover | null {
  return pendingCover?.id === storyId(r) ? pendingCover.cover : null;
}

// ---------- "Wrong photo?" ----------

export type PhotoReportReason = 'wrong_animal' | 'not_a_photo_of_it' | 'inappropriate' | 'other';

// Hide the photo for this player right away and report it (one report hides
// it for everyone; the team can review reports).
export async function reportPhoto(url: string, opts: { species?: string; context?: string; reason?: PhotoReportReason } = {}): Promise<void> {
  useCrewStore.getState().hidePhoto(url);
  await crewFetch('/api/crew/flag-photo', { method: 'POST', body: JSON.stringify({ url, species: opts.species, context: opts.context, reason: opts.reason ?? 'wrong_animal' }) });
}
