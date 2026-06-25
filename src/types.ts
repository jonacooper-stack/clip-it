// Shared client types for Clip-It.

export type IdStatus =
  | 'identifying'
  | 'ai_confident'
  | 'needs_review'
  | 'human_confirmed'
  | 'disputed'
  | 'rejected';

export interface ScoreBreakdown {
  basePoints: number;
  behaviorMultiplier: number;
  bonuses: {
    firstOfSpecies: number;
    quest: number;
    streak: number;
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
