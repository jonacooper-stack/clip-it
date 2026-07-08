// Shared client types for Clip-It.

export type IdStatus =
  | 'identifying'
  | 'queued' // captured offline; awaiting analysis when back online
  | 'ai_confident'
  | 'needs_review'
  | 'human_confirmed'
  | 'disputed'
  | 'ineligible'
  | 'rejected';

export interface ScoreBreakdown {
  basePoints: number;
  behaviorMultiplier: number;
  /** <1 when this species was already photographed (diminishing returns); 0 for an
   * exact-duplicate photo. Absent on scores from before this rule (treat as 1). */
  repeatMultiplier?: number;
  bonuses: {
    firstOfSpecies: number;
    quest: number;
    streak: number;
    /** Bonus for answering optional science questions about the sighting. */
    fieldNotes: number;
  };
  totalPoints: number;
  ruleVersion: string;
}

export interface SpeciesGuess {
  scientificName: string;
  commonName: string;
  confidence: number; // 0..1
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
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  goal: number;
  rewardPoints: number;
  /** Optional broad taxon filter for matching sightings (dev heuristic). */
  group?: 'bird' | 'mammal' | 'any';
}

export type AgeBracket = 'under_13' | '13_17' | 'adult';
