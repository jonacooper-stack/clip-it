import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TopoBackground } from '@/components/TopoBackground';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';

const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: 'camera', title: 'Photograph wildlife', text: 'Snap real wild animals to score points.' },
  { icon: 'sparkles', title: 'Rare = big points', text: 'Elusive species and dramatic moments are worth more.' },
  { icon: 'book', title: 'Build your journal', text: 'Collect species, complete quests, keep streaks.' },
  { icon: 'leaf', title: 'Observe, never disturb', text: 'Catch-and-release — your sightings help science.' },
];

export default function Welcome() {
  const router = useRouter();
  return (
    <ScreenContainer scroll>
      <View style={styles.hero}>
        <TopoBackground color={colors.white} opacity={0.1} />
        <View style={styles.logoBadge}>
          <Ionicons name="eye" size={44} color={colors.accent} />
        </View>
        <Text style={styles.title}>ClipIt</Text>
        <Text style={styles.tagline}>Catch-and-release hunting — a game for real wildlife.</Text>
      </View>

      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <View style={styles.pointBadge}>
              <Ionicons name={p.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.pointBody}>
              <Text style={styles.pointTitle}>{p.title}</Text>
              <Text style={styles.pointText}>{p.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <Button
        label="Get started"
        variant="accent"
        icon="arrow-forward"
        onPress={() => router.push('/onboarding/age-gate')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  logoBadge: {
    width: 92,
    height: 92,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.hero,
    fontFamily: fonts.display,
    color: colors.white,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: font.body,
    color: colors.onPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    lineHeight: 23,
  },
  points: { marginBottom: spacing.xl, gap: spacing.md },
  point: { flexDirection: 'row', alignItems: 'center' },
  pointBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  pointBody: { flex: 1 },
  pointTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  pointText: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginTop: 1 },
});
