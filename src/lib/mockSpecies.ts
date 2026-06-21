// Dev-only species catalog + a mock identifier. Used when no Supabase backend is
// configured so the whole loop is playable offline. In production the
// identify-and-score Edge Function replaces this entirely.

import type { IdStatus, SpeciesGuess } from '@/types';
import { SCENE_TAGS } from './sceneTags';

export interface MockSpecies {
  scientificName: string;
  commonName: string;
  rarityScore: number; // 0 common .. 1 rare
  group: 'bird' | 'mammal' | 'insect';
  dangerous?: boolean;
  emoji: string;
  color: string;
}

export const MOCK_SPECIES: MockSpecies[] = [
  { scientificName: 'Sciurus carolinensis', commonName: 'Eastern gray squirrel', rarityScore: 0.05, group: 'mammal', emoji: '🐿️', color: '#9C7A54' },
  { scientificName: 'Turdus migratorius', commonName: 'American robin', rarityScore: 0.08, group: 'bird', emoji: '🐦', color: '#C56B47' },
  { scientificName: 'Odocoileus virginianus', commonName: 'White-tailed deer', rarityScore: 0.1, group: 'mammal', emoji: '🦌', color: '#A9885F' },
  { scientificName: 'Anas platyrhynchos', commonName: 'Mallard', rarityScore: 0.12, group: 'bird', emoji: '🦆', color: '#3E7C59' },
  { scientificName: 'Procyon lotor', commonName: 'Raccoon', rarityScore: 0.15, group: 'mammal', emoji: '🦝', color: '#6B7079' },
  { scientificName: 'Danaus plexippus', commonName: 'Monarch butterfly', rarityScore: 0.2, group: 'insect', emoji: '🦋', color: '#D98324' },
  { scientificName: 'Vulpes vulpes', commonName: 'Red fox', rarityScore: 0.22, group: 'mammal', emoji: '🦊', color: '#C9622E' },
  { scientificName: 'Ardea herodias', commonName: 'Great blue heron', rarityScore: 0.3, group: 'bird', emoji: '🪶', color: '#5E7E92' },
  { scientificName: 'Buteo jamaicensis', commonName: 'Red-tailed hawk', rarityScore: 0.35, group: 'bird', emoji: '🦅', color: '#8A5A3B' },
  { scientificName: 'Ursus americanus', commonName: 'American black bear', rarityScore: 0.6, group: 'mammal', dangerous: true, emoji: '🐻', color: '#3A2E28' },
];

export function findMockSpecies(scientificName?: string): MockSpecies | undefined {
  if (!scientificName) return undefined;
  return MOCK_SPECIES.find((s) => s.scientificName === scientificName);
}

export interface MockOutcome {
  animalPresent: boolean;
  species: SpeciesGuess;
  rarityScore: number;
  sceneTags: string[];
  caption: string;
  dangerous: boolean;
  idStatus: IdStatus;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Weight selection toward more common species (lower rarity = seen more often).
function weightedSpecies(): MockSpecies {
  const weighted: MockSpecies[] = [];
  for (const s of MOCK_SPECIES) {
    const weight = Math.max(1, Math.round((1 - s.rarityScore) * 10));
    for (let i = 0; i < weight; i++) weighted.push(s);
  }
  return pick(weighted);
}

export function mockIdentify(): MockOutcome {
  const species = weightedSpecies();

  // Occasionally attach a plausible behavior tag.
  const tags: string[] = [];
  const roll = Math.random();
  if (species.group === 'bird' && roll < 0.4) tags.push('in_flight');
  else if (species.group === 'mammal' && roll < 0.18) tags.push('with_young');
  else if (species.commonName === 'Red fox' && roll < 0.25) tags.push('predation');
  else if (species.commonName === 'White-tailed deer' && roll < 0.3) tags.push('group_herd');

  const confidence = Number((0.62 + Math.random() * 0.36).toFixed(2));
  const requiresReview = tags.some((t) => SCENE_TAGS[t]?.requiresReview);
  const needsReview = confidence < 0.75 || requiresReview || Boolean(species.dangerous);

  return {
    animalPresent: true,
    species: {
      scientificName: species.scientificName,
      commonName: species.commonName,
      confidence,
    },
    rarityScore: species.rarityScore,
    sceneTags: tags,
    caption: `A ${species.commonName.toLowerCase()} spotted in the wild.`,
    dangerous: Boolean(species.dangerous),
    idStatus: needsReview ? 'needs_review' : 'ai_confident',
  };
}
