import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TopoBackground } from '@/components/TopoBackground';
import { colors, spacing, font, fonts, radius } from '@/theme';

const POINTS = [
  { emoji: '📸', text: 'Photograph real wild animals to earn points' },
  { emoji: '🦊', text: 'Rarer animals and dramatic moments are worth more' },
  { emoji: '📔', text: 'Build a field journal and complete quests' },
  { emoji: '🌿', text: 'Your sightings help science — observe, never disturb' },
];

export default function Welcome() {
  const router = useRouter();
  return (
    <ScreenContainer scroll>
      <View style={styles.hero}>
        <TopoBackground color={colors.primary} opacity={0.1} />
        <Text style={styles.logo}>🌲</Text>
        <Text style={styles.title}>CLIP-IT</Text>
        <Text style={styles.tagline}>Catch-and-release hunting — a game for real wildlife.</Text>
      </View>

      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.text} style={styles.point}>
            <Text style={styles.pointEmoji}>{p.emoji}</Text>
            <Text style={styles.pointText}>{p.text}</Text>
          </View>
        ))}
      </View>

      <Button label="Get started" icon="arrow-forward" onPress={() => router.push('/onboarding/age-gate')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  logo: { fontSize: 64 },
  title: { fontSize: font.display + 4, fontFamily: fonts.display, color: colors.text, marginTop: spacing.sm, letterSpacing: 1 },
  tagline: {
    fontSize: font.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },
  points: { marginBottom: spacing.xl },
  point: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  pointEmoji: { fontSize: 26, width: 40 },
  pointText: { flex: 1, fontSize: font.body, color: colors.text, lineHeight: 22 },
});
