import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { processAnalysisQueue } from '@/lib/analysis';

// Asks the player's permission before any photo is sent to a third-party AI
// for identification (App Store Guideline 5.1.2(i)). Shown during sign-up,
// and before the first capture for anyone who hasn't answered yet. The
// choice can be changed any time in Profile.

const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'camera',
    title: 'What’s sent',
    body: 'When you snap or upload a photo, a smaller copy is sent to Anthropic’s Claude AI, which names the animal and helps score it.',
  },
  {
    icon: 'location',
    title: 'What’s not',
    body: 'Your location is never sent, and hidden photo details (like GPS) are removed first.',
  },
  {
    icon: 'lock-closed',
    title: 'What happens to it',
    body: 'Photos are only used to identify the animal. We don’t keep them on our server, and they aren’t used to train AI.',
  },
  {
    icon: 'sparkles',
    title: 'Scout, your AI guide',
    body: 'Scout gets the names of the animals you find (never your photos) to share fun facts and stories.',
  },
];

export default function AiConsent() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const setAiConsent = useAppStore((s) => s.setAiConsent);

  const go = () => {
    if (next) router.replace(next as any);
    else if (router.canGoBack()) router.back();
    else router.replace('/feed');
  };
  const allow = () => {
    setAiConsent(true);
    processAnalysisQueue(); // identify anything that was waiting for this
    go();
  };
  const notNow = () => {
    setAiConsent(false);
    // From the camera, "not now" means no camera; elsewhere, carry on.
    if (next?.startsWith('/capture')) router.replace('/feed');
    else go();
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.badge}>
        <Ionicons name="sparkles" size={26} color={colors.accent} />
      </View>
      <Text style={styles.title}>ClipIt uses AI to identify animals</Text>
      <Text style={styles.subtitle}>Before we send any of your photos, here’s exactly how it works.</Text>

      {POINTS.map((p) => (
        <Card key={p.title} style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name={p.icon} size={20} color={colors.primary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{p.title}</Text>
            <Text style={styles.cardText}>{p.body}</Text>
          </View>
        </Card>
      ))}

      <Text style={styles.note}>
        ClipIt needs this to identify and score your photos. If you choose “Not now”, you can still browse the feed,
        read Scout’s stories and follow explorers, and turn it on any time in Profile. Details are in the Privacy
        Policy (Profile → Privacy policy).
      </Text>

      <Button label="Allow AI identification" icon="checkmark" onPress={allow} />
      <View style={styles.later}>
        <Button label="Not now" variant="ghost" onPress={notNow} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  badge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.md },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  cardIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text, marginBottom: 2 },
  cardText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  note: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginVertical: spacing.lg },
  later: { marginTop: spacing.sm },
});
