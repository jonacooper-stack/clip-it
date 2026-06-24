import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, font, fonts } from '@/theme';

interface Props {
  points: number;
  size?: 'sm' | 'lg';
  prefix?: boolean;
}

export function PointsBadge({ points, size = 'sm', prefix = false }: Props) {
  const large = size === 'lg';
  return (
    <View style={[styles.badge, large && styles.badgeLg]}>
      <Text style={[styles.text, large && styles.textLg]}>
        {prefix ? '+' : ''}
        {points}
        <Text style={styles.unit}> pts</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeLg: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  text: { color: colors.accentInk, fontFamily: fonts.display, fontSize: font.body },
  textLg: { fontSize: font.title },
  unit: { fontFamily: fonts.bodyBold, fontSize: font.tiny },
});
