// Identify orchestration. The default (offline) mode returns a mock so the loop is
// fully playable with no backend. With a server configured it calls the Vercel
// function (api/identify.ts) for real Claude identification; the server also
// records a result that counts in the player's cloud journal and scores it.

import { Platform } from 'react-native';
import * as Network from 'expo-network';
import type { IdSource, IdStatus, ScoreBreakdown, SpeciesGuess } from '@/types';
import type { PhotoEvidence } from '../../shared/photoEvidence';
import type { CloudRow } from './journalMerge';
import { deviceTimeZone } from './apiBase';
import { supabase } from './supabase';
import { mockIdentify } from './mockSpecies';

const IDENTIFY_URL = process.env.EXPO_PUBLIC_IDENTIFY_URL ?? '/api/identify';
// On web the endpoint is same-origin ('/api/identify'). On native a relative path
// can't be reached, so the real AI runs only when an absolute URL is configured.
const hasAbsoluteIdentifyUrl = /^https?:\/\//i.test(IDENTIFY_URL);

// Thrown when a capture couldn't be identified right now, so the caller can
// queue it and try again later. `status` is the server's HTTP status when it
// answered with an error (a server problem, too many requests, signed out…);
// it's undefined when the server couldn't be reached at all (no connection).
export class OfflineError extends Error {
  status?: number;
  /** The server's own words for the player, when it gave a reason. */
  detail?: string;
  /** How long the server asked us to wait before trying again, in seconds. */
  retryAfterS?: number;
  constructor(message = 'offline', status?: number, extra: { detail?: string; retryAfterS?: number } = {}) {
    super(message);
    this.name = 'OfflineError';
    this.status = status;
    this.detail = extra.detail;
    this.retryAfterS = extra.retryAfterS;
  }
}

// Statuses that mean "this photo can never be identified" (unreadable, too
// large, or the identifier declined it): trying again won't help.
const PERMANENT = new Set([400, 413, 415, 422]);

export function isPermanentFailure(err: unknown): boolean {
  return err instanceof OfflineError && err.status != null && PERMANENT.has(err.status);
}

// The identify endpoint answered, but with an error.
class EndpointError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
    readonly retryAfterS?: number,
  ) {
    super(message);
    this.name = 'EndpointError';
  }
}

// The server understood the request and said no: this photo can't be
// identified, or the player has to wait. A made-up result is never right then.
function turnedDown(err: unknown): err is EndpointError {
  return err instanceof EndpointError && (err.status === 429 || PERMANENT.has(err.status));
}

function asOffline(err: any): OfflineError {
  if (err instanceof OfflineError) return err;
  if (err instanceof EndpointError) return new OfflineError(err.message, err.status, { detail: err.detail, retryAfterS: err.retryAfterS });
  return new OfflineError(String(err?.message ?? err));
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
  // For the cloud journal: which sighting this photo is for, and whose. With
  // these the server records a result that counts and scores it.
  sightingId?: string;
  loggedAt?: number;
  account?: string;
  /** Taken with the in-app camera, or uploaded from the camera roll. */
  capture?: 'camera' | 'library';
  /** For an upload: whether the photo carries a camera's details. */
  evidence?: PhotoEvidence;
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
  // ----- the cloud journal -----
  /** The server recorded the sighting; `journal` is its row (score included). */
  recorded?: boolean;
  journal?: CloudRow;
  /** The server's signed note for a result it couldn't record right now. */
  receipt?: string;
  /** The player's totals after this sighting, when the server worked them out. */
  totals?: { points: number; speciesCount: number } | null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function identifySighting(input: IdentifyInput): Promise<IdentifyOutcome> {
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
      // web demo fall back to the mock identifier, and not when the server
      // turned the photo down or asked the player to wait.
      if ((Platform.OS !== 'web' && !__DEV__) || turnedDown(err)) throw asOffline(err);
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

// A little longer than the server allows itself (24s), so a slow answer still
// arrives instead of being paid for and thrown away.
const IDENTIFY_TIMEOUT_MS = 28000;

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
      body: JSON.stringify({
        imageBase64: input.photoBase64,
        mediaType: 'image/jpeg',
        // Which sighting this is, and when and where it was taken: the server
        // keeps the journal now. (An older server ignores these.)
        sightingId: input.sightingId,
        account: input.account,
        observedAt: input.observedAt,
        loggedAt: input.loggedAt,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        capture: input.capture,
        evidence: input.evidence,
        tz: deviceTimeZone(),
      }),
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
    const wait = Number(resp.headers.get('Retry-After'));
    throw new EndpointError(
      `identify endpoint ${resp.status}${detail ? `: ${detail}` : ''}`,
      resp.status,
      detail || undefined,
      Number.isFinite(wait) && wait > 0 ? wait : undefined,
    );
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
    recorded: data.recorded === true,
    journal: data.journal && typeof data.journal === 'object' ? (data.journal as CloudRow) : undefined,
    receipt: typeof data.receipt === 'string' ? data.receipt : undefined,
    totals: data.totals && typeof data.totals.points === 'number' ? data.totals : undefined,
  };
}
