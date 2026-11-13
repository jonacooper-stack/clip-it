// The address to show a sighting's photo from: its file on this device, or,
// for a photo that so far lives only in the cloud journal, a signed link
// (fetched on demand; see lib/cloudPhotos).
import { useCallback, useEffect } from 'react';
import { resolvePhoto } from './photoStore';
import { cloudRefId, dropCloudPhoto, isCloudRef, useCloudPhotos, wantCloudPhoto } from './cloudPhotos';

export function usePhoto(ref?: string | null): { uri: string | undefined; onError: () => void } {
  const id = isCloudRef(ref) ? cloudRefId(ref) : null;
  const link = useCloudPhotos((s) => (id ? s.urls[id] : undefined));
  useEffect(() => {
    if (id && !link) wantCloudPhoto(id);
  }, [id, link]);
  // If the picture won't load from a cloud link, the link has probably expired: get another.
  const onError = useCallback(() => {
    if (id) dropCloudPhoto(id);
  }, [id]);
  return { uri: id ? link : resolvePhoto(ref), onError };
}
