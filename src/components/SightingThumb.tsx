import { useState } from 'react';
import { Image } from 'expo-image';
import { SpeciesAvatar } from './SpeciesAvatar';
import { resolvePhoto } from '@/lib/photoStore';

// A sighting's photo as a square thumbnail, falling back to the species icon when
// there's no photo — or when the file can't be loaded (e.g. an older capture whose
// cached file iOS purged before we moved photos to permanent storage).
export function SightingThumb({
  photoUri,
  scientificName,
  size,
  radius = 16,
}: {
  photoUri?: string;
  scientificName?: string;
  size: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = resolvePhoto(photoUri);
  if (src && !failed) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <SpeciesAvatar scientificName={scientificName} size={size} />;
}
