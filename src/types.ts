// Shared client types for Clip-It.

import type { Retry } from '@/lib/retry';
import type { PhotoEvidence } from '../shared/photoEvidence';

export type IdStatus =
  | 'identifying'
  | 'queued' // captured offline; awaiting analysis when back online
  | 'ai_confident'
  | 'needs_review'
  | 'human_confirmed'
  | 'disputed'
  | 'ineligible'
  | 'rejected';

export type { ScoreBreakdown } from '../shared/scoring';
import type { ScoreBreakdown } from '../shared/scoring';

export interface SpeciesGuess {
  scientificName: string;
  commonName: string;
  confidence: number; // 0..1
  /** Broad animal group from the AI: bird, mammal, reptile, amphibian, fish, insect, other. */
  group?: string;
}

/** Where an identification came from, so the UI can be honest about demo guesses. */
export type IdSource = 'ai' | 'mock' | 'backend';

export interface Sighting {
  id: string;
  createdAt: number;
  observedAt: number;
  photoUri?: string;
  /** Hash of the photo bytes, for detecting an exact-duplicate resubmission. */
  photoHash?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  species?: SpeciesGuess;
  sceneTags: string[];
  caption?: string;
  idStatus: IdStatus;
  points?: number;
  score?: ScoreBreakdown;
  dangerous?: boolean;
  proposedSpecies?: string;
  source?: IdSource;
  /** Why a demo/mock result was used (e.g. the AI endpoint error), for diagnostics. */
  note?: string;
  /** When idStatus is 'ineligible', why it doesn't score (e.g. pets/people don't count). */
  ineligibleReason?: string;
  /** Optional citizen-science answers (questionId -> selected values). Some
   * questions allow more than one. Legacy data may hold a single string. */
  science?: Record<string, string[]>;
  /** Scout's notes on this sighting (facts, and other players' photos of the species). */
  crew?: CrewNotes;
  /** The wall post this sighting was shared as (so it can't be shared twice). */
  wallPostId?: string;
  /** For a queued capture: how many times identifying it has failed, and when
   * to try again (see lib/analysis). */
  retry?: Retry;

  // ----- the cloud journal (see lib/journalSync) -----
  /** How the photo got here: taken with the in-app camera, or uploaded from the camera roll. */
  capture?: 'camera' | 'library';
  /** For an upload: whether the photo carried a camera's details (sent to the server's photo check). */
  evidence?: PhotoEvidence;
  /** When the server last confirmed it holds this sighting. Unset: not in the cloud yet. */
  cloudAt?: number;
  /** When the server recorded it. (A sighting handed in more than a week after it was taken counts, for quests, in the week it was handed in.) */
  recordedAt?: number;
  /** Counts the player's changes to what the cloud keeps (field notes, a suggested species, the wall post). */
  rev?: number;
  /** The `rev` the server has. A higher `rev` means a change still waiting to be sent. */
  sentRev?: number;
  /** The server's signed note for a result it couldn't record at the time; sent on the next sync. */
  receipt?: string;
  /** The server identified and scored this sighting itself. */
  verified?: boolean;
  /** The cloud holds a copy of the photo. */
  cloudPhoto?: boolean;
  /** The server won't take this sighting (so don't keep sending it). */
  cloudSkip?: boolean;
  /** What the server counts this sighting for (it can be less than `points` for one scored on the phone). */
  cloudPoints?: number;
}

export interface CrewOtherPost {
  postId: string;
  photoUrl: string;
  name: string;
  likes: number;
  createdAt: string;
}

export interface CrewPhoto {
  url: string;
  credit: string;
  species: string;
  /** Where the photo and its license are described (tap the credit to open). */
  source?: string;
}

export interface CrewNotes {
  facts: string[];
  tip: string;
  others: CrewOtherPost[];
  photo: CrewPhoto | null;
  /** More photos of the species (library, then Wikimedia Commons), one per fact. */
  photos?: CrewPhoto[];
  /** 3 = 5 short facts + photos. Older notes are refetched. */
  v?: number;
  fetchedAt: number;
}

export type { Quest } from '../shared/quests';

export type AgeBracket = 'under_13' | '13_17' | 'adult';
