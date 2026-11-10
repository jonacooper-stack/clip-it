// Identify orchestration. The default (offline) mode returns a mock so the loop is
// fully playable with no backend. On the deployed web app it calls the Vercel
// function (api/identify.ts) for real Claude identification. A Supabase path is
// kept for the future shared-data backend. Any failure falls back to the mock so
// the app never gets stuck.

import { Platform } from 'react-native';
import * as Network from 'expo-network';
import type { IdSource, IdStatus, ScoreBreakdown, SpeciesGuess } from '@/types';
import { supabase } from './supabase';
import { mockIdentify } from './mockSpecies';
import { useAppStore } from '@/state/useAppStore';

// Thrown when the player hasn't said OK to AI identification yet. Callers
// treat it like being offline: the capture is kept and identified later.
export class NeedsAiConsentError extends Error {
  constructor() {
    super('ai consent needed');
    this.name = 'NeedsAiConsentError';
  }
}

const IDENTIFY_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL ?? '/api/identify';
// On web the endpoint is same-origin ('/api/identify'). On native a relative path
// can't be reached, so the real AI runs only when an absolute URL is configured.
const hasAbsoluteIdentifyUrl = /^https?:\/\//i.test(IDENTIFY_URL);
// The Supabase identify-and-score function isn't deployed yet, so don't route
// identification through it just because Supabase is configured for auth/social.
const USE_SUPABASE_IDENTIFY = process.env.EXPO_PUBLIC_USE_SUPABASE_IDENTIFY === 'true';

// Thrown when the identify endpoint can't be reached (no connectivity) so the
// caller can queue the capture and analyze it once the device is back online.
export class OfflineError extends Error {
  constructor(message = 'offline') {
    super(message);
    this.name = 'OfflineError';
  }
}

// Fast, local connectivity check (no network round trip) so we can queue an
// offline capture immediately instead of waiting for a request to time out.
// Unknown/ambiguous states return true — let the request try and fall back.
async function deviceIsOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

export interface IdentifyInput {
  photoBase64?: string | null;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  observedAt: number;
}

export interface IdentifyOutcome {
  /** Any identifiable subject (wild animal, pet, or person). False => nothing to show. */
  present: boolean;
  /** A wild animal that actually scores. False for pets/people/objects. */
  eligible: boolean;
  /** 'wild_animal' | 'pet' | 'human' | 'other'. */
  category?: string;
  /** When not eligible, a friendly reason it doesn't count. */
  ineligibleReason?: string;
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
  // No photo leaves the device for AI identification without the player's OK.
  if (useAppStore.getState().aiConsent !== true) throw new NeedsAiConsentError();
  // Future shared-data backend (only when explicitly enabled — the function isn't deployed yet).
  if (USE_SUPABASE_IDENTIFY && supabase) {
    try {
      return await identifyViaBackend(input);
    } catch (err) {
      console.warn('Supabase identify failed, falling back:', err);
    }
  }

  // Real AI via the Vercel function — on web (same-origin) or native (absolute URL).
  let note: string | undefined;
  if (input.photoBase64 && (Platform.OS === 'web' || hasAbsoluteIdentifyUrl)) {
    // Check for a signal first: if the device is offline, queue the capture right
    // away rather than waiting on a request that's bound to fail.
    if (Platform.OS !== 'web' && !(await deviceIsOnline())) {
      throw new OfflineError('no network');
    }
    try {
      return await identifyViaEndpoint(input);
    } catch (err: any) {
      // In release builds on the phone, never invent a result: any failure
      // (offline, server error, timeout) queues the capture, which is retried
      // automatically and scored once the AI answers. Only dev builds and the
      // web demo fall back to the mock identifier.
      if (Platform.OS !== 'web' && !__DEV__) {
        throw err instanceof OfflineError ? err : new OfflineError(String(err?.message ?? err));
      }
      if (err instanceof OfflineError) {
        // Native dev builds queue the capture too; web just uses the demo identifier.
        if (Platform.OS !== 'web') throw err;
        note = 'You appear to be offline — used the demo identifier.';
      } else {
        note = String(err?.message ?? err);
        console.warn('AI endpoint failed, using mock:', err);
      }
    }
  } else if (!input.photoBase64) {
    note = 'No photo was captured to send to the AI.';
  } else {
    note = 'Real AI isn’t configured for this build yet — used the demo identifier.';
  }

  // Offline / dev fallback. The mock can't see the photo, so it always returns an
  // eligible wild animal.
  await delay(1500 + Math.random() * 900);
  const m = mockIdentify();
  return {
    present: true,
    eligible: m.animalPresent,
    category: 'wild_animal',
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

const IDENTIFY_TIMEOUT_MS = 20000;

async function identifyViaEndpoint(input: IdentifyInput): Promise<IdentifyOutcome> {
  let resp: Response;
  // Bound the request so a stalled connection (signal present but going nowhere)
  // can never spin forever — on timeout we treat it as offline and queue.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDENTIFY_TIMEOUT_MS);
  try {
    // The endpoint only serves signed-in players: send the Supabase access token
    // (getSession refreshes it if it has expired, e.g. for a queued capture).
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    resp = await fetch(IDENTIFY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64: input.photoBase64, mediaType: 'image/jpeg' }),
      signal: controller.signal,
    });
  } catch (err: any) {
    // fetch rejects (rather than returning a bad status) when the network is
    // unreachable or the request times out — treat both as offline so the caller
    // can queue the capture.
    throw new OfflineError(String(err?.message ?? err));
  } finally {
    clearTimeout(timer);
  }
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
    present: Boolean(data.present),
    eligible: Boolean(data.eligible),
    category: typeof data.category === 'string' ? data.category : undefined,
    ineligibleReason: typeof data.ineligibleReason === 'string' ? data.ineligibleReason : undefined,
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
    present: data.status !== 'rejected',
    eligible: data.status !== 'rejected',
    category: 'wild_animal',
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
