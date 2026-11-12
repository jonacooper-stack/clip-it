import { PHOTO_LIBRARY, type LibraryPhoto } from './photoLibrary';
export type { LibraryPhoto };
import { SITE_URL } from './server';

export interface PhotoRef {
  url: string;
  credit: string;
  species: string;
  source?: string; // where the photo and its license are described
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

// A licensed library photo of this species (by scientific, then common name).
export function findLibraryPhoto(species: string, sci?: string | null, seed = 0): PhotoRef | null {
  const bySci = sci ? PHOTO_LIBRARY.filter((p) => norm(p.sci) === norm(sci)) : [];
  const pool = bySci.length ? bySci : PHOTO_LIBRARY.filter((p) => norm(p.species) === norm(species));
  if (!pool.length) return null;
  return toRef(pool[Math.abs(seed) % pool.length]);
}

export function toRef(p: LibraryPhoto): PhotoRef {
  return { url: `${SITE_URL}/img/library/${p.slug}.jpg`, credit: p.credit, species: p.species, source: `${SITE_URL}/credits.html` };
}

// Library photo tags → the regions they suit.
// Untagged photos (the curated core set) suit everywhere.
const TAG_REGIONS: Record<string, string[]> = {
  west: ['pacific_northwest', 'california', 'rockies', 'southwest', 'alaska', 'plains'],
  northeast: ['northeast', 'mid_atlantic', 'midwest', 'canada', 'plains'],
  southeast: ['southeast', 'mid_atlantic', 'texas', 'hawaii'],
  east: ['northeast', 'mid_atlantic', 'midwest', 'southeast', 'plains', 'texas', 'canada'],
  north: ['northeast', 'midwest', 'canada', 'alaska', 'rockies', 'pacific_northwest'],
  world: ['elsewhere'], // not North American: only for players who explore elsewhere
};

function suits(p: LibraryPhoto, region: string): boolean {
  return !p.region || (TAG_REGIONS[p.region] ?? []).includes(region);
}

// Species we have photos of that suit a region (so Scout can prefer them).
export function regionSpecies(region: string): string[] {
  return [...new Set(PHOTO_LIBRARY.filter((p) => suits(p, region) && !p.species.includes('(')).map((p) => p.species))];
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The photo for a region's "species of the day": a fixed shuffle of the
// region's pool, walked one step per day, so nothing repeats until every
// species has had its day. One species per photo set (no twins in a row).
export function dailyPick(region: string, date: string): LibraryPhoto {
  const pool = PHOTO_LIBRARY.filter((p) => suits(p, region));
  const bySpecies = new Map<string, LibraryPhoto[]>();
  for (const p of pool) bySpecies.set(p.species, [...(bySpecies.get(p.species) ?? []), p]);
  const species = [...bySpecies.keys()].sort((a, b) => hashStr(`${region}:${a}`) - hashStr(`${region}:${b}`));
  const n = dayNumber(date);
  const name = species[((n % species.length) + species.length) % species.length];
  const photos = bySpecies.get(name)!;
  return photos[Math.floor(n / species.length) % photos.length];
}
