import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';

const ETHOS: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body: string }[] = [
  {
    icon: 'leaf',
    color: colors.primary,
    title: 'Respect wildlife',
    body: 'Observe from a distance. Never bait, chase, or disturb an animal or its home for a photo.',
  },
  {
    icon: 'shield-checkmark',
    color: colors.primary,
    title: 'Stay safe',
    body: 'Keep your distance from anything that could be dangerous. Points are for the photo — never for how close you got.',
  },
  {
    icon: 'star',
    color: colors.accent,
    title: 'How scoring works',
    body: 'Rarer animals and standout moments — babies, action shots, birds in flight — are worth more points.',
  },
];

export default function Ethos() {
  const router = useRouter();
  const setOnboarded = useAppStore((s) => s.setOnboarded);
  const [, requestCamera] = useCameraPermissions();

  const finish = async (requestPerms: boolean) => {
    if (requestPerms) {
      try {
        await requestCamera();
        await Location.requestForegroundPermissionsAsync();
      } catch {
        // Permissions can be granted later from the OS settings.
      }
    }
    setOnboarded(true);
    router.replace('/');
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Before you head out</Text>
      <Text style={styles.subtitle}>The spirit of ClipIt in three ideas.</Text>

      {ETHOS.map((e) => (
        <Card key={e.title} style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name={e.icon} size={20} color={e.color} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{e.title}</Text>
            <Text style={styles.cardText}>{e.body}</Text>
          </View>
        </Card>
      ))}

      <View style={styles.perms}>
        <Text style={styles.permsText}>
          ClipIt needs your <Text style={styles.bold}>camera</Text> to photograph animals and your{' '}
          <Text style={styles.bold}>location</Text> to tag where you saw them — kept private to you.
        </Text>
      </View>

      <Button label="Allow camera & location" icon="checkmark-circle" onPress={() => finish(true)} />
      <Button label="Maybe later" variant="ghost" onPress={() => finish(false)} style={styles.later} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.lg },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text, marginBottom: 2 },
  cardText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  perms: { marginVertical: spacing.lg },
  permsText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  bold: { fontFamily: fonts.bodyBold, color: colors.text },
  later: { marginTop: spacing.sm },
});
