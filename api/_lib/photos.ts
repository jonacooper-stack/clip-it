// More photos of one species, so Scout's posts can show a different picture
// on every slide: our curated library first, then freely licensed photos from
// Wikimedia Commons (quality images first). Results are cached with the
// species' facts, so Commons is asked at most once per species. Best-effort:
// on any error or timeout this returns what it has.
import { PHOTO_LIBRARY } from './photoLibrary';
import { toRef, type PhotoRef } from './library';
import { log } from './server';

const UA = 'ClipItWildlife/1.0 (+https://clipitwildlife.app/support)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LICENSE = /^(public domain|pd\b|cc0|cc by(-sa)? [1-4]\.\d)/i;
// Not photos of a live animal (book plates, fact sheets, specimens…).
const SKIP =
  /\b(plates?|bhl|illustrations?|drawing|engraving|painting|lithograph|sketch|information|infographic|maps?|range|distribution|skulls?|skeletons?|specimens?|museum|eggs?|stamps?|diagram|chart|dead|carcass|roadkill|taxiderm\w*|mounted|hatchery|nfh|x-ray|logo|collage|comparison|cooked|dish|recipe)\b/i;

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function libraryPhotos(species: string, sci?: string | null): PhotoRef[] {
  const bySci = sci ? PHOTO_LIBRARY.filter((p) => norm(p.sci) === norm(sci)) : [];
  const pool = bySci.length ? bySci : PHOTO_LIBRARY.filter((p) => norm(p.species) === norm(species));
  return pool.map(toRef);
}

async function commonsSearch(search: string, limit: number, timeoutMs: number): Promise<PhotoRef[]> {
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (res.status === 429) {
      // One polite retry (Wikimedia rate-limits busy IPs).
      const wait = Math.min(Number(res.headers?.get?.('retry-after')) || 1.5, 2.5) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    }
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
      if (!url.startsWith('https://upload.wikimedia.org/')) continue;
      out.push({ url, credit: `${artist} · ${license}`, species: title, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replace(/ /g, '_'))}` });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// Up to `max` photos of a species: library first, then Commons. `failed`
// means Commons couldn't be reached (worth retrying soon), as opposed to
// having nothing suitable.
export async function speciesPhotoLookup(species: string, sci?: string | null, max = 5): Promise<{ photos: PhotoRef[]; failed: boolean }> {
  const out = libraryPhotos(species, sci).slice(0, max);
  if (out.length >= max) return { photos: out, failed: false };
  const q = sci?.trim() ? `"${sci.trim()}"` : `"${species.trim()}"`;
  try {
    for (const extra of ['incategory:Quality_images', '']) {
      if (out.length >= max) break;
      const found = await commonsSearch(`${q} filetype:bitmap ${extra}`.trim(), 15, 6000);
      for (const p of found) {
        if (out.length >= max) break;
        if (!out.some((o) => o.url === p.url)) out.push({ ...p, species });
      }
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
