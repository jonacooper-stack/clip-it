import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, fonts } from '@/theme';

type Level = { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap };

// Turn a 0..1 confidence into a human level. Thresholds match the server's
// needsReview cutoff (<0.75 gets a human look) so the wording stays consistent.
export function confidenceLevel(confidence: number): Level {
  if (confidence >= 0.85) {
    return { label: 'High confidence', color: colors.primary, bg: colors.primarySoft, icon: 'checkmark-circle' };
  }
  if (confidence >= 0.6) {
    return { label: 'Likely', color: colors.accentInk, bg: colors.accentSoft, icon: 'help-circle' };
  }
  return { label: 'Low confidence', color: colors.clay, bg: colors.claySoft, icon: 'alert-circle' };
}

export function ConfidenceBadge({
  confidence,
  size = 'md',
}: {
  confidence: number;
  size?: 'sm' | 'md';
}) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const l = confidenceLevel(confidence);
  const sm = size === 'sm';
  return (
    <View style={[styles.badge, sm && styles.badgeSm, { backgroundColor: l.bg }]}>
      <Ionicons name={l.icon} size={sm ? 13 : 15} color={l.color} />
      <Text style={[styles.text, sm && styles.textSm, { color: l.color }]}>
        {l.label} · {pct}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  badgeSm: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, gap: 4, alignSelf: 'flex-start' },
  text: { fontSize: font.small, fontFamily: fonts.bodyBold, letterSpacing: 0.2 },
  textSm: { fontSize: font.tiny },
});
