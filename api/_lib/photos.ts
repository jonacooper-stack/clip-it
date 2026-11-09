// More photos of one species, so Scout's posts can show a different picture
// on every slide: our curated (hand-checked) library first, then freely
// licensed photos from Wikimedia Commons (quality images first).
//
// Every Commons photo is checked before it can be used: it's downloaded and
// shown to Claude, which must confirm it's a real photo of that live animal
// (not a diagram, specimen, device, captive bird on a glove…). Results are
// cached with the species' facts, so this happens at most once per species.
// Photos players report as wrong are filtered out (photoFlags.ts).
import type Anthropic from '@anthropic-ai/sdk';
import { PHOTO_LIBRARY } from './photoLibrary';
import { toRef, type PhotoRef } from './library';
import { askJSON } from './claude';
import { blockedKeys, photoKey } from './photoFlags';
import { adminClient, log } from './server';

const UA = 'ClipItWildlife/1.0 (+https://clipitwildlife.app/support)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LICENSE = /^(public domain|pd\b|cc0|cc by(-sa)? [1-4]\.\d)/i;
// Cheap first pass on file names (the vision check is the real gate).
const SKIP =
  /\b(plates?|bhl|illustrations?|drawing|engraving|painting|lithograph|sketch|information|infographic|maps?|range|distribution|skulls?|skeletons?|specimens?|museum|mhnt|osteolog\w*|eggs?|stamps?|diagram|chart|dead|carcass|roadkill|taxiderm\w*|mounted|hatchery|nfh|x-ray|logo|collage|comparison|cooked|dish|recipe|captive|zoo|falconry|photoelasticity)\b/i;
// Commons serves thumbnails from upload.wikimedia.org or thumb.wikimedia.org.
const COMMONS_HOST = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function libraryPhotos(species: string, sci?: string | null): PhotoRef[] {
  const bySci = sci ? PHOTO_LIBRARY.filter((p) => norm(p.sci) === norm(sci)) : [];
  const pool = bySci.length ? bySci : PHOTO_LIBRARY.filter((p) => norm(p.species) === norm(species));
  return pool.map(toRef);
}

async function timedFetch(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    let res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers as any) }, signal: ctrl.signal });
    if (res.status === 429) {
      // One polite retry (Wikimedia rate-limits busy IPs).
      const wait = Math.min(Number(res.headers?.get?.('retry-after')) || 1.5, 2.5) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers as any) }, signal: ctrl.signal });
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function commonsSearch(search: string, limit: number): Promise<PhotoRef[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsrsearch: search,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1280',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  });
  const res = await timedFetch(`${API}?${params}`, 6000);
  if (!res.ok) throw new Error(`commons ${res.status}`);
  const data: any = await res.json();
  const pages: any[] = Object.values(data?.query?.pages ?? {}).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
  const out: PhotoRef[] = [];
  for (const p of pages) {
    const title = String(p.title ?? '').replace(/^File:/, '');
    const ii = p.imageinfo?.[0];
    if (!ii || !/\.jpe?g$/i.test(title) || SKIP.test(title) || (ii.width ?? 0) < 1000) continue;
    const license = stripTags(ii.extmetadata?.LicenseShortName?.value ?? '');
    if (!OK_LICENSE.test(license)) continue;
    const artist =
      stripTags(ii.extmetadata?.Artist?.value ?? '')
        .replace(/^(photo(graph)?|image)\s*(by)?\s*(and)?\s*/i, '')
        .replace(/(\(c\)|©|copyright)\s*\d{0,4}/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48) || 'Wikimedia Commons';
    const url = String(ii.thumburl || ii.url || '').split('?')[0];
    if (!COMMONS_HOST.test(url)) continue;
    out.push({ url, credit: `${artist} · ${license}`, species: title, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replace(/ /g, '_'))}` });
  }
  return out;
}

const VERIFY_SYSTEM =
  'You check photos for ClipIt, a wildlife photography app for kids and teens. Each numbered image is a ' +
  'candidate to illustrate the animal named. Mark it ok ONLY if it is a real photograph that clearly shows a live ' +
  'individual of that species, easy to see, in the wild or a natural-looking setting. Not ok: a different species, ' +
  'a drawing, painting, diagram, map or chart; a skeleton, skull, museum specimen, mounted or dead animal; a ' +
  'captive animal being held or on a glove; mainly people, pets, devices, traps, signs, nest boxes or buildings; ' +
  'only tracks, nests or homes without the animal; anything gory or unsuitable for kids. When unsure, say not ok.';

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, ok: { type: 'boolean' }, reason: { type: 'string' } },
        required: ['index', 'ok', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

// Download a smaller copy (960px is a standard Commons thumbnail size).
async function fetchForCheck(url: string): Promise<string | null> {
  const small = url.replace(/\/1280px-/, '/960px-');
  try {
    const res = await timedFetch(small, 8000);
    if (!res.ok || !/^image\/jpe?g/.test(res.headers.get('content-type') ?? 'image/jpeg')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length < 4_500_000 ? buf.toString('base64') : null;
  } catch {
    return null;
  }
}

// Ask Claude which candidates really show the animal. Throws if the check
// itself can't run (then nothing unchecked is used).
export async function verifyPhotos(species: string, sci: string | null | undefined, candidates: PhotoRef[]): Promise<PhotoRef[]> {
  const loaded = (await Promise.all(candidates.map(async (c) => ({ c, data: await fetchForCheck(c.url) })))).filter((x) => x.data);
  if (!loaded.length) throw new Error('could not download any candidate photos');
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: 'text', text: `Animal: ${species}${sci ? ` (${sci})` : ''}. ${loaded.length} candidate images follow, numbered 1 to ${loaded.length}.` },
  ];
  loaded.forEach((x, i) => {
    content.push({ type: 'text', text: `Image ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.data! } });
  });
  const out = await askJSON<{ results: { index: number; ok: boolean; reason: string }[] }>({ system: VERIFY_SYSTEM, prompt: content, schema: VERIFY_SCHEMA, maxTokens: 4000 });
  const okIdx = new Set((out.results ?? []).filter((r) => r.ok).map((r) => r.index));
  const rejected = (out.results ?? []).filter((r) => !r.ok).map((r) => `${loaded[r.index - 1]?.c.species ?? r.index}: ${r.reason}`.slice(0, 140));
  if (rejected.length) log('species_photos_rejected', { species, rejected });
  return loaded.filter((_, i) => okIdx.has(i + 1)).map((x) => x.c);
}

// Up to `max` photos of a species: library first, then checked Commons
// photos. `failed` means the lookup or the check couldn't run (worth retrying
// soon), as opposed to there being nothing suitable.
export async function speciesPhotoLookup(species: string, sci?: string | null, max = 5): Promise<{ photos: PhotoRef[]; failed: boolean }> {
  const db = adminClient();
  const blocked = (refs: PhotoRef[]) => blockedKeys(db, refs.map((r) => r.url));
  const lib = libraryPhotos(species, sci);
  const libBlocked = await blocked(lib);
  const out = lib.filter((p) => !libBlocked.has(photoKey(p.url))).slice(0, max);
  if (out.length >= max) return { photos: out, failed: false };
  const q = sci?.trim() ? `"${sci.trim()}"` : `"${species.trim()}"`;
  try {
    const candidates: PhotoRef[] = [];
    for (const extra of ['incategory:Quality_images', '']) {
      if (candidates.length >= 8) break;
      for (const p of await commonsSearch(`${q} filetype:bitmap ${extra}`.trim(), 15)) {
        if (candidates.length < 8 && !candidates.some((c) => photoKey(c.url) === photoKey(p.url))) candidates.push({ ...p, species });
      }
    }
    const flagged = await blocked(candidates);
    const fresh = candidates.filter((c) => !flagged.has(photoKey(c.url)));
    if (fresh.length) {
      const good = await verifyPhotos(species, sci, fresh);
      for (const p of good) if (out.length < max) out.push(p);
    }
  } catch (err: any) {
    log('species_photos_error', { species, detail: String(err?.message ?? err).slice(0, 160) });
    return { photos: out, failed: true };
  }
  return { photos: out, failed: false };
}

export async function speciesPhotos(species: string, sci?: string | null, max = 5): Promise<PhotoRef[]> {
  return (await speciesPhotoLookup(species, sci, max)).photos;
}
