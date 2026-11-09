import { Image } from 'expo-image';
import type { CrewKey } from '../../../shared/crew';

const AVATARS: Record<CrewKey, number> = {
  scout: require('../../../assets/crew/scout.png'),
};

export function CrewAvatar({ crew = 'scout', size = 40 }: { crew?: CrewKey; size?: number }) {
  return <Image source={AVATARS[crew]} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
}
