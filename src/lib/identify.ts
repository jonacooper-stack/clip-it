// Identify orchestration. In the default (offline) mode this returns a mock
// result so the loop is fully playable. When Supabase is configured it uploads
// the photo, creates the sighting row, and invokes the identify-and-score
// Edge Function — falling back to the mock if anything goes wrong, so the app
// never gets stuck.

import type { IdStatus, ScoreBreakdown, SpeciesGuess } from '@/types';
import { isSupabaseConfigured, supabase } from './supabase';
import { mockIdentify } from './mockSpecies';

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
  /** Present from the mock so the client can score; null from the server (already scored). */
  rarityScore?: number;
  sceneTags: string[];
  caption: string;
  dangerous: boolean;
  idStatus: IdStatus;
  /** Present when the server scored it. */
  points?: number;
  score?: ScoreBreakdown;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function identifySighting(input: IdentifyInput): Promise<IdentifyOutcome> {
  if (isSupabaseConfigured && supabase) {
    try {
      return await identifyViaBackend(input);
    } catch (err) {
      console.warn('Backend identify failed, using mock:', err);
    }
  }

  // Offline / dev path.
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
  };
}

function decodeBase64(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
