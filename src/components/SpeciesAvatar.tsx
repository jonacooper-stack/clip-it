import { View, Text, StyleSheet } from 'react-native';
import { radius } from '@/theme';
import { findMockSpecies } from '@/lib/mockSpecies';

interface Props {
  scientificName?: string;
  size?: number;
}

export function SpeciesAvatar({ scientificName, size = 56 }: Props) {
  const species = findMockSpecies(scientificName);
  const emoji = species?.emoji ?? '🐾';
  const color = species?.color ?? '#6B7079';
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: radius.md, backgroundColor: color },
      ]}
    >
      <View style={styles.overlay} />
      <Text style={{ fontSize: size * 0.46 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.16)' },
});
