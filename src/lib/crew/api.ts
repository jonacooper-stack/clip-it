// Talking to the Field Crew's server endpoints (api/crew/*). Everything here is
// best-effort: if the network or server is down, the crew simply has less to
// say, and nothing else in the app is affected.
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useJournalStore } from '@/state/useJournalStore';
import { useCrewStore, type Forecast } from '@/state/useCrewStore';
import type { CrewNotes, Sighting } from '@/types';
import { weekOf, type RegionKey } from '../../../shared/crew';

// Same server as the identify endpoint (absolute on native, same-origin on web).
const IDENTIFY_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL ?? '/api/identify';
const API_BASE = Platform.OS === 'web' ? '' : IDENTIFY_URL.replace(/\/api\/identify\/?$/, '');
const hasServer = Platform.OS === 'web' || /^https?:\/\//i.test(API_BASE);

async function authHeaders(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function crewFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!hasServer) return null;
  const auth = await authHeaders();
  if (!auth) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
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

// Fetch Dr. Hoot's facts + Magpie's finds for a sighting and save them on it.
// Reuses notes from another sighting of the same species fetched in the last
// week (no server call). With `postId`, also asks Dr. Hoot to comment on the
// wall post the player just shared.
export async function fetchCrewNotes(sightingId: string, opts: { postId?: string } = {}): Promise<CrewNotes | null> {
  const store = useJournalStore.getState();
  const s = store.sightings.find((x) => x.id === sightingId);
  if (!s?.species?.commonName || s.idStatus === 'rejected' || s.idStatus === 'ineligible') return null;
  const key = `${sightingId}:${opts.postId ?? ''}`;
  if (inFlight.has(key)) return s.crew ?? null;

  if (!opts.postId) {
    if (s.crew && Date.now() - s.crew.fetchedAt < 7 * 86_400_000) return s.crew;
    const twin = store.sightings.find(
      (x) => x.id !== sightingId && x.crew && x.species?.commonName === s.species?.commonName && Date.now() - x.crew.fetchedAt < 7 * 86_400_000,
    );
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
    const notes: CrewNotes = { facts: res.facts ?? [], tip: res.tip ?? '', others: res.others ?? [], photo: res.photo ?? null, fetchedAt: Date.now() };
    useJournalStore.getState().updateSighting(sightingId, { crew: notes });
    return notes;
  } finally {
    inFlight.delete(key);
  }
}

// Scout's forecast for this week, from the device cache or the server.
export async function loadForecast(region: RegionKey): Promise<Forecast | null> {
  const week = weekOf();
  const cached = useCrewStore.getState().forecasts[`${region}:${week}`];
  if (cached) return cached;
  const f = await crewFetch<Forecast>(`/api/crew/forecast?region=${encodeURIComponent(region)}`);
  if (f?.items?.length) useCrewStore.getState().saveForecast(f);
  return f;
}

export function cachedForecast(region: RegionKey | null): Forecast | null {
  if (!region) return null;
  return useCrewStore.getState().forecasts[`${region}:${weekOf()}`] ?? null;
}

// Save the home region on the account (both auth metadata, for other devices,
// and the profile, for the server). Best-effort.
export async function saveHomeRegion(region: RegionKey): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return;
  await Promise.allSettled([
    supabase.auth.updateUser({ data: { homeRegion: region } }),
    supabase.from('profiles').update({ home_region: region }).eq('id', uid),
  ]);
}

export function sightingsWithNotes(sightings: Sighting[]): Sighting[] {
  return sightings.filter((s) => s.crew && (s.crew.facts.length || s.crew.others.length || s.crew.photo));
}
