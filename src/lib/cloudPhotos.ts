// Photos that live in the cloud journal but not (yet) on this device: a new
// phone, a reinstall, or the web app after a page reload.
//
// Such a sighting's photo is recorded as "cloud:<sighting id>". The picture
// itself sits in private storage, readable only by its owner through a
// short-lived signed link. Links are fetched when a photo is about to be
// shown, kept in memory only (a saved link would have expired by the next
// time it was needed), and fetched again if one stops working.
import { create } from 'zustand';
import { supabase } from './supabase';
import { useAuthStore } from '@/state/useAuthStore';

const BUCKET = 'journal-photos';
const PREFIX = 'cloud:';
const LINK_SECONDS = 3600;

export const cloudRef = (sightingId: string) => `${PREFIX}${sightingId}`;
export const isCloudRef = (ref?: string | null): ref is string => typeof ref === 'string' && ref.startsWith(PREFIX);
export const cloudRefId = (ref: string) => ref.slice(PREFIX.length);

// sighting id -> a working link
export const useCloudPhotos = create<{ urls: Record<string, string> }>(() => ({ urls: {} }));

let wanted = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const failedAt = new Map<string, number>(); // don't hammer storage for a photo that isn't there

const path = (uid: string, id: string) => `${uid}/${id}.jpg`;
const uidNow = () => useAuthStore.getState().session?.user?.id ?? null;

// Ask for a photo's link. Requests made close together go out as one.
export function wantCloudPhoto(id: string): void {
  if (useCloudPhotos.getState().urls[id] || Date.now() - (failedAt.get(id) ?? 0) < 60_000) return;
  wanted.add(id);
  timer ??= setTimeout(flush, 50);
}

async function flush(): Promise<void> {
  timer = null;
  const ids = [...wanted].slice(0, 100);
  wanted = new Set([...wanted].slice(100));
  if (wanted.size) timer = setTimeout(flush, 50);
  const uid = uidNow();
  if (!supabase || !uid || !ids.length) return;
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(ids.map((id) => path(uid, id)), LINK_SECONDS);
    if (uidNow() !== uid) return; // signed out (or someone else signed in) meanwhile
    const next: Record<string, string> = {};
    ids.forEach((id, i) => {
      const url = data?.[i]?.signedUrl;
      if (url && !data?.[i]?.error) next[id] = url;
      else failedAt.set(id, Date.now());
    });
    if (Object.keys(next).length) useCloudPhotos.setState((s) => ({ urls: { ...s.urls, ...next } }));
  } catch {
    for (const id of ids) failedAt.set(id, Date.now());
  }
}

// A link stopped working (it expired): drop it, so the next request fetches a fresh one.
export function dropCloudPhoto(id: string): void {
  useCloudPhotos.setState((s) => {
    if (!s.urls[id]) return s;
    const { [id]: _gone, ...rest } = s.urls;
    return { urls: rest };
  });
}

// One link, now (for downloading a photo to the device, or sharing it).
export async function cloudPhotoUrl(id: string): Promise<string | undefined> {
  const uid = uidNow();
  if (!supabase || !uid) return undefined;
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path(uid, id), LINK_SECONDS);
    return data?.signedUrl ?? undefined;
  } catch {
    return undefined;
  }
}

// Links belong to the signed-in account: forget them when that changes.
export function clearCloudPhotos(): void {
  wanted = new Set();
  failedAt.clear();
  useCloudPhotos.setState({ urls: {} });
}
