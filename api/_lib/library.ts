import { PHOTO_LIBRARY, type LibraryPhoto } from './photoLibrary';
import { SITE_URL } from './server';

export interface PhotoRef {
  url: string;
  credit: string;
  species: string;
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
  return { url: `${SITE_URL}/img/library/${p.slug}.jpg`, credit: p.credit, species: p.species };
}
