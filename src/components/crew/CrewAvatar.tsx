import { Image } from 'expo-image';
import type { CrewKey } from '../../../shared/crew';

const AVATARS: Record<CrewKey, number> = {
  hoot: require('../../../assets/crew/hoot.png'),
  scout: require('../../../assets/crew/scout.png'),
  moss: require('../../../assets/crew/moss.png'),
  magpie: require('../../../assets/crew/magpie.png'),
  kestrel: require('../../../assets/crew/kestrel.png'),
};

export function CrewAvatar({ crew, size = 40 }: { crew: CrewKey; size?: number }) {
  return <Image source={AVATARS[crew]} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
}
