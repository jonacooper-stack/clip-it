import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TopoBackground } from '@/components/TopoBackground';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';

const POINTS = [
  { emoji: '📸', title: 'Photograph wildlife', text: 'Snap real wild animals to score points.' },
  { emoji: '🦊', title: 'Rare = big points', text: 'Elusive species and dramatic moments are worth more.' },
  { emoji: '📔', title: 'Build your journal', text: 'Collect species, complete quests, keep streaks.' },
  { emoji: '🌿', title: 'Observe, never disturb', text: 'Catch-and-release — your sightings help science.' },
];

export default function Welcome() {
  const router = useRouter();
  return (
    <ScreenContainer scroll>
      <View style={styles.hero}>
        <TopoBackground color={colors.white} opacity={0.12} />
        <View style={styles.logoBadge}>
          <Text style={styles.logo}>🌲</Text>
        </View>
        <Text style={styles.title}>CLIP-IT</Text>
        <Text style={styles.tagline}>Catch-and-release hunting — a game for real wildlife.</Text>
      </View>

      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <View style={styles.pointBadge}>
              <Text style={styles.pointEmoji}>{p.emoji}</Text>
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
    overflow: 'hidden',
    ...shadow.card,
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logo: { fontSize: 56 },
  title: {
    fontSize: font.hero,
    fontFamily: fonts.display,
    color: colors.white,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: font.body,
    color: colors.primarySoft,
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
  pointEmoji: { fontSize: 26 },
  pointBody: { flex: 1 },
  pointTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  pointText: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginTop: 1 },
});
