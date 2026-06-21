import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, font } from '@/theme';
import { sceneTagMeta } from '@/lib/sceneTags';

export function Tag({ code }: { code: string }) {
  const meta = sceneTagMeta(code);
  if (!meta) return null;
  return (
    <View style={styles.tag}>
      <Text style={styles.text}>
        {meta.emoji} {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    marginRight: spacing.sm,
    marginTop: spacing.sm,
  },
  text: { color: colors.text, fontSize: font.small, fontWeight: '600' },
});
