import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCameraPermissions } from 'expo-camera';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font } from '@/theme';
import { useAppStore } from '@/state/useAppStore';

const ETHOS = [
  {
    emoji: '🌿',
    title: 'Respect wildlife',
    body: 'Observe from a distance. Never bait, chase, or disturb an animal or its home for a photo.',
  },
  {
    emoji: '🛡️',
    title: 'Stay safe',
    body: 'Keep your distance from anything that could be dangerous. Points are for the photo — never for how close you got.',
  },
  {
    emoji: '⭐',
    title: 'How scoring works',
    body: 'Rarer animals and more dramatic moments — babies, hunting, flight — are worth more points.',
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
      <Text style={styles.subtitle}>The spirit of Clip-It in three ideas.</Text>

      {ETHOS.map((e) => (
        <Card key={e.title} style={styles.card}>
          <Text style={styles.cardEmoji}>{e.emoji}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{e.title}</Text>
            <Text style={styles.cardText}>{e.body}</Text>
          </View>
        </Card>
      ))}

      <View style={styles.perms}>
        <Text style={styles.permsText}>
          Clip-It needs your <Text style={styles.bold}>camera</Text> to photograph animals and your{' '}
          <Text style={styles.bold}>location</Text> to tag where you saw them — kept private to you.
        </Text>
      </View>

      <Button label="Allow camera & location" icon="checkmark-circle" onPress={() => finish(true)} />
      <Button label="Maybe later" variant="ghost" onPress={() => finish(false)} style={styles.later} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { flexDirection: 'row', marginBottom: spacing.md },
  cardEmoji: { fontSize: 28, width: 44 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: font.body, fontWeight: '800', color: colors.text, marginBottom: 2 },
  cardText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  perms: { marginVertical: spacing.lg },
  permsText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  bold: { fontWeight: '800', color: colors.text },
  later: { marginTop: spacing.sm },
});
