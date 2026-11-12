import { useState } from 'react';
import { Image } from 'expo-image';
import { SpeciesAvatar } from './SpeciesAvatar';
import { usePhoto } from '@/lib/usePhoto';

// A sighting's photo as a square thumbnail, falling back to the species icon when
// there's no photo — or when the file can't be loaded (e.g. an older capture whose
// cached file iOS purged before we moved photos to permanent storage). A photo
// that lives only in the cloud journal is shown from there (lib/usePhoto).
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
  const { uri: src, onError } = usePhoto(photoUri);
  if (src && !failed) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        onError={() => {
          onError(); // an expired cloud link is dropped, so the next visit fetches a fresh one
          setFailed(true);
        }}
      />
    );
  }
  return <SpeciesAvatar scientificName={scientificName} size={size} />;
}
