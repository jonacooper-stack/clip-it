// Identify orchestration. The default (offline) mode returns a mock so the loop is
// fully playable with no backend. On the deployed web app it calls the Vercel
// function (api/identify.ts) for real Claude identification. A Supabase path is
// kept for the future shared-data backend. Any failure falls back to the mock so
// the app never gets stuck.

import { Platform } from 'react-native';
import type { IdSource, IdStatus, ScoreBreakdown, SpeciesGuess } from '@/types';
import { isSupabaseConfigured, supabase } from './supabase';
import { mockIdentify } from './mockSpecies';

const IDENTIFY_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL ?? '/api/identify';

export interface IdentifyInput {
  photoBase64?: string | null;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  observedAt: number;
}

export interface IdentifyOutcome {
  animalPresent: boolean;
  species?: SpeciesGuess;
  /** Present from the mock/endpoint so the client can score; absent when the server already scored. */
  rarityScore?: number;
  sceneTags: string[];
  caption: string;
  dangerous: boolean;
  idStatus: IdStatus;
  /** Present when a server scored it. */
  points?: number;
  score?: ScoreBreakdown;
  /** How the identification was produced, so the UI can flag offline demo guesses. */
  source: IdSource;
  /** When we fell back to the mock, why the real AI didn't run (for diagnostics). */
  note?: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function identifySighting(input: IdentifyInput): Promise<IdentifyOutcome> {
  // Future shared-data backend (unused until we stand up Supabase).
  if (isSupabaseConfigured && supabase) {
    try {
      return await identifyViaBackend(input);
    } catch (err) {
      console.warn('Supabase identify failed, falling back:', err);
    }
  }

  // Real AI via the Vercel function — when we're on the web build and have a photo to send.
  let note: string | undefined;
  if (Platform.OS === 'web' && input.photoBase64) {
    try {
      return await identifyViaEndpoint(input);
    } catch (err: any) {
      note = String(err?.message ?? err);
      console.warn('AI endpoint failed, using mock:', err);
    }
  } else if (Platform.OS !== 'web') {
    note = 'Real AI runs only on the deployed web app, not in the native build.';
  } else if (!input.photoBase64) {
    note = 'No photo was captured to send to the AI.';
  }

  // Offline / dev fallback.
  await delay(1500 + Math.random() * 900);
  const m = mockIdentify();
  return {
    animalPresent: m.animalPresent,
    species: m.species,
    rarityScore: m.rarityScore,
    sceneTags: m.sceneTags,
    caption: m.caption,
    dangerous: m.dangerous,
    idStatus: m.idStatus,
    source: 'mock',
    note,
  };
}

async function identifyViaEndpoint(input: IdentifyInput): Promise<IdentifyOutcome> {
  const resp = await fetch(IDENTIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: input.photoBase64, mediaType: 'image/jpeg' }),
  });
  if (!resp.ok) {
    // Surface the server's reason (e.g. the real Anthropic API error) so the app
    // can tell the user why it fell back to the demo identifier. Prefer `detail`
    // (the specific cause) over `error` (a generic label).
    let detail = '';
    try {
      const e = await resp.json();
      detail = e?.detail || e?.error || '';
    } catch {
      // body wasn't JSON; the status code alone is the signal
    }
    throw new Error(`identify endpoint ${resp.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await resp.json();
  return {
    animalPresent: Boolean(data.animalPresent),
    species: data.species as SpeciesGuess | undefined,
    rarityScore: typeof data.rarityScore === 'number' ? data.rarityScore : undefined,
    sceneTags: Array.isArray(data.sceneTags) ? data.sceneTags : [],
    caption: typeof data.caption === 'string' ? data.caption : '',
    dangerous: Boolean(data.dangerous),
    idStatus: (data.idStatus as IdStatus) ?? 'ai_confident',
    source: 'ai',
  };
}

async function identifyViaBackend(input: IdentifyInput): Promise<IdentifyOutcome> {
  if (!supabase) throw new Error('no client');

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('not signed in');

  // 1. Upload the photo to Storage.
  const path = `${userId}/${input.observedAt}.jpg`;
  if (input.photoBase64) {
    const bytes = decodeBase64(input.photoBase64);
    const { error: upErr } = await supabase.storage
      .from('sightings')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw upErr;
  }

  // 2. Insert the sighting row (precise geom set server-side from lat/lng).
  const { data: row, error: insErr } = await supabase
    .from('sightings')
    .insert({
      user_id: userId,
      observed_at: new Date(input.observedAt).toISOString(),
      media_path: path,
      capture_method: 'in_app_camera',
      location_accuracy_m: input.accuracyM,
      id_status: 'ai_pending',
    })
    .select('id')
    .single();
  if (insErr || !row) throw insErr ?? new Error('insert failed');

  // 3. Invoke the trusted identify-and-score function.
  const { data, error: fnErr } = await supabase.functions.invoke('identify-and-score', {
    body: { sightingId: row.id },
  });
  if (fnErr) throw fnErr;

  return {
    animalPresent: data.status !== 'rejected',
    species: data.species,
    sceneTags: data.sceneTags ?? [],
    caption: data.caption ?? '',
    dangerous: Boolean(data.dangerous),
    idStatus: data.status as IdStatus,
    points: data.points ?? undefined,
    source: 'backend',
  };
}

function decodeBase64(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
