import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/theme';

// A person's avatar in the social feed: a colored circle with their initial.
// (We don't collect profile photos yet — this keeps the feed personal without one.)
const PALETTE = ['#35A65F', '#F4812F', '#7CA9C6', '#E6B23C', '#D27C4A', '#8E7CC3', '#4FB0A5'];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function UserAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.44 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.white, fontFamily: fonts.display },
});
