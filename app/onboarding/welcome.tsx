import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { WildlifeGallery } from '@/components/WildlifeGallery';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { HERO_PHOTO } from '@/lib/heroPhoto';

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
        <ImageBackground source={HERO_PHOTO} resizeMode="cover" style={StyleSheet.absoluteFill} />
        {/* Dark gradient so the wordmark stays legible over any photo. */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0A1410" stopOpacity="0.05" />
              <Stop offset="0.5" stopColor="#0A1410" stopOpacity="0.34" />
              <Stop offset="1" stopColor="#0A1410" stopOpacity="0.94" />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#scrim)" />
        </Svg>
        <View style={styles.heroContent}>
          <View style={styles.kickerRow}>
            <Ionicons name="leaf" size={13} color={colors.accentInk} />
            <Text style={styles.kicker}>FIELD GUIDE TO THE WILD</Text>
          </View>
          <Text style={styles.title}>ClipIt</Text>
          <Text style={styles.tagline}>Catch-and-release hunting — a game for real wildlife.</Text>
        </View>
      </View>

      <View style={styles.gallerySection}>
        <Text style={styles.galleryTitle}>A few of the locals</Text>
        <WildlifeGallery />
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

      {isSupabaseConfigured && (
        <Text style={styles.signin} onPress={() => router.push('/onboarding/account?mode=signin')}>
          Already have an account? <Text style={styles.signinLink}>Sign in</Text>
        </Text>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    // Close to the landscape photo's 1.33 ratio so it isn't cropped to a strip.
    aspectRatio: 1.2,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryDark,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    ...shadow.card,
  },
  heroContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  gallerySection: { marginBottom: spacing.xl },
  galleryTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.md },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  kicker: { fontSize: font.tiny, fontFamily: fonts.bodyBold, letterSpacing: 1.6, color: colors.accentInk },
  title: {
    fontSize: font.hero + 4,
    fontFamily: fonts.display,
    color: '#FFFFFF',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  tagline: {
    fontSize: font.body,
    color: '#E9EEE7',
    marginTop: spacing.xs,
    lineHeight: 23,
    maxWidth: '94%',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
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
  signin: { fontSize: font.small, color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  signinLink: { color: colors.primary, fontFamily: fonts.bodyBold },
});
