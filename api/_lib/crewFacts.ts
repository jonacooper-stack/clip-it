// Scout's facts: generated once per species, cached in crew_facts, reused for
// everyone (and for Scout's comments on the wall). Written so a 12-year-old can
// read them at a glance: one short sentence each, starting with an emoji.
import type { SupabaseClient } from '@supabase/supabase-js';
import { askJSON } from './claude';
import { log } from './server';
import { withArticle } from '../../shared/crew';
import { speciesPhotoLookup } from './photos';
import type { PhotoRef } from './library';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface SpeciesFacts {
  facts: string[]; // 5 short facts, emoji first
  tip: string;
  photos?: PhotoRef[]; // a different photo per slide (library, then checked Commons photos)
  photosAt?: number; // when photos were last looked up
  photosV?: number; // PHOTOS_V: lookups before the vision check are redone
}

const PHOTOS_V = 2;

const PHOTO_RETRY_MS = 3 * 86_400_000;

const SYSTEM =
  'You are Scout, a friendly fox who is the AI guide in ClipIt, a wildlife photography game for ages 13 and up. ' +
  'Players have just photographed an animal. Give them facts a 12-year-old would love and understand at a glance. ' +
  'Rules: only facts that are accurate and widely documented in field guides and encyclopedias; prefer surprising ' +
  'but well-established facts; never invent; avoid exact numbers unless they are textbook-standard. ' +
  'Each fact is ONE short, simple sentence of at most 90 characters, using everyday words, that starts with one ' +
  'fitting emoji and a space. No markdown, no lists inside a fact, no "Did you know". ' +
  'The tip says how to spot this animal or tell it from a look-alike, in the same style (emoji first, at most 90 characters).';

const SCHEMA = {
  type: 'object',
  properties: {
    facts: { type: 'array', items: { type: 'string' } },
    tip: { type: 'string' },
  },
  required: ['facts', 'tip'],
  additionalProperties: false,
};

// In-memory cache per warm instance (in addition to the database cache), so a
// burst of players finding the same species makes one model call.
const memo = new Map<string, Promise<SpeciesFacts>>();

// 'kid:' versions the cache: entries written before the short, emoji-first
// style are ignored and regenerated.
export function speciesKey(common: string, sci?: string | null): string {
  return `kid:${(sci?.trim() || common.trim()).toLowerCase()}`;
}

// Keep facts short even if the model runs long: cut at a word boundary.
export function shorten(text: string, max = 110): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[,;:\s]+$/, '')}…`;
}

async function withPhotos(db: SupabaseClient | null, key: string, common: string, sci: string | null | undefined, f: SpeciesFacts): Promise<SpeciesFacts> {
  const stale = !f.photos || f.photosV !== PHOTOS_V || (f.photos.length < 3 && Date.now() - (f.photosAt ?? 0) > PHOTO_RETRY_MS);
  if (!stale) return f;
  const { photos, failed } = await speciesPhotoLookup(common, sci, 5);
  // If Commons was unreachable, look again in about an hour instead of days.
  const photosAt = failed ? Date.now() - PHOTO_RETRY_MS + 3600_000 : Date.now();
  const keepOld = f.photosV === PHOTOS_V && (f.photos?.length ?? 0) > photos.length;
  const next: SpeciesFacts = { ...f, photos: keepOld ? f.photos : photos, photosAt, photosV: PHOTOS_V };
  if (db) {
    const { error } = await db.from('crew_facts').upsert({ species_key: key, common_name: common, facts: next });
    if (error) log('crew_facts_cache_error', { detail: error.message });
  }
  return next;
}

export async function getFacts(db: SupabaseClient | null, common: string, sci?: string | null): Promise<SpeciesFacts> {
  const key = speciesKey(common, sci);
  if (!memo.has(key)) {
    memo.set(
      key,
      (async () => {
        let cachedPhotos: Pick<SpeciesFacts, 'photos' | 'photosAt' | 'photosV'> = {};
        if (db) {
          const { data } = await db.from('crew_facts').select('facts').eq('species_key', key).maybeSingle();
          const row = data?.facts as SpeciesFacts | undefined;
          if (row?.facts?.length) return withPhotos(db, key, common, sci, row);
          if (row) cachedPhotos = { photos: row.photos, photosAt: row.photosAt, photosV: row.photosV };
        }
        const out = await askJSON<SpeciesFacts>({
          system: SYSTEM,
          prompt: `Species: ${common}${sci ? ` (${sci})` : ''}. Give 5 different facts (looks, food, babies, ` +
            `superpowers, where it lives or how it behaves) and 1 tip.`,
          schema: SCHEMA,
        });
        const clean: SpeciesFacts = {
          facts: (out.facts ?? []).map((f) => shorten(String(f))).filter(Boolean).slice(0, 5),
          tip: shorten(String(out.tip ?? '')),
          ...cachedPhotos,
        };
        if (!clean.facts.length) throw new Error('no facts returned');
        log('crew_facts_generated', { species: key });
        return withPhotos(db, key, common, sci, clean); // also caches the facts
      })().catch((err) => {
        memo.delete(key); // don't cache failures
        throw err;
      }),
    );
  }
  return memo.get(key)!;
}

// Just the photos of a species (checked, cached per species with its facts).
// Doesn't generate facts; stores a photos-only row when there are none yet.
const photoMemo = new Map<string, Promise<PhotoRef[]>>();
export function getSpeciesPhotos(db: SupabaseClient | null, common: string, sci?: string | null): Promise<PhotoRef[]> {
  const key = speciesKey(common, sci);
  if (!photoMemo.has(key)) {
    photoMemo.set(
      key,
      (async () => {
        let row: SpeciesFacts = { facts: [], tip: '' };
        if (db) {
          const { data } = await db.from('crew_facts').select('facts').eq('species_key', key).maybeSingle();
          if (data?.facts) row = data.facts as SpeciesFacts;
        }
        return (await withPhotos(db, key, common, sci, row)).photos ?? [];
      })().catch((err) => {
        photoMemo.delete(key);
        throw err;
      }),
    );
    setTimeout(() => photoMemo.delete(key), 10 * 60_000).unref?.(); // pick up refreshes on warm instances
  }
  return photoMemo.get(key)!;
}

// Scout's voice for wall comments. Picks a phrasing from the post id so it's
// stable but varied.
export function scoutComment(species: string, facts: SpeciesFacts, seed: string): string {
  const n = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const fact = facts.facts[n % facts.facts.length];
  const openers = [
    `Wow, ${withArticle(species)}! 🦊`,
    `Great ${species} spot! 🦊`,
    `${cap(withArticle(species))}! Nice one 🦊`,
    `Ooh, ${species}! 🦊`,
  ];
  return `${openers[n % openers.length]}\n${fact}`;
}

export function scoutWelcome(name: string, species: string | null): string {
  const first = name.split(' ')[0] || 'explorer';
  return species
    ? `Welcome to the wall, ${first}! 🦊\n🎉 ${cap(withArticle(species))} for your first post. What a start!`
    : `Welcome to the wall, ${first}! 🦊\n🎉 What a first post. See you out there!`;
}
