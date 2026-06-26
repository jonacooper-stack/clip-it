import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useJournalStore, totalPoints, distinctSpecies } from '@/state/useJournalStore';
import type { AgeBracket } from '@/types';

const BRACKET_LABEL: Record<AgeBracket, string> = {
  under_13: 'Kid (under 13)',
  '13_17': 'Teen (13–17)',
  adult: 'Adult',
};

export default function Profile() {
  const router = useRouter();
  const displayName = useAppStore((s) => s.displayName);
  const ageBracket = useAppStore((s) => s.ageBracket);
  const streak = useAppStore((s) => s.streakCount);
  const resetApp = useAppStore((s) => s.reset);
  const sightings = useJournalStore((s) => s.sightings);
  const resetJournal = useJournalStore((s) => s.reset);

  const points = useMemo(() => totalPoints(sightings), [sightings]);
  const speciesCount = useMemo(() => distinctSpecies(sightings).length, [sightings]);

  const soon = (label: string) => Alert.alert(label, 'Coming in a later phase.');

  const onReset = () =>
    Alert.alert('Reset app data?', 'This clears your journal and onboarding (for testing).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetJournal();
          resetApp();
          router.replace('/onboarding/welcome');
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          {ageBracket && <Text style={styles.bracket}>{BRACKET_LABEL[ageBracket]}</Text>}
        </View>

        <View style={styles.statGrid}>
          <Stat value={points} label="points" />
          <Stat value={speciesCount} label="species" />
          <Stat value={sightings.length} label="sightings" />
          <Stat value={streak} label="day streak" />
        </View>

        <Card style={styles.ethos}>
          <View style={styles.ethosHead}>
            <Ionicons name="leaf" size={18} color={colors.primary} />
            <Text style={styles.ethosTitle}>Observe, don't disturb</Text>
          </View>
          <Text style={styles.ethosText}>
            ClipIt rewards the photo, never the proximity. Keep your distance, leave no trace, and
            let wildlife stay wild.
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.settings}>
          <Row icon="lock-closed" label="Privacy & location" onPress={() => soon('Privacy & location')} />
          <Divider />
          <Row icon="people" label="Manage child profile" onPress={() => soon('Child profiles')} />
          <Divider />
          <Row icon="trash" label="Delete account" danger onPress={() => soon('Delete account')} />
        </Card>

        <Pressable onPress={onReset} style={styles.devReset}>
          <Text style={styles.devResetText}>Reset app data (dev)</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function Row({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.muted} />
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 34, fontFamily: fonts.display, color: colors.white },
  name: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.sm },
  bracket: { fontSize: font.small, color: colors.muted, marginTop: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { width: '47.5%', alignItems: 'center', paddingVertical: spacing.md, flexGrow: 1 },
  statValue: { fontSize: font.title, fontFamily: fonts.display, color: colors.primary },
  statLabel: { fontSize: font.tiny, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  ethos: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, marginBottom: spacing.lg },
  ethosHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  ethosTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.onPrimary },
  ethosText: { fontSize: font.small, color: colors.onPrimary, lineHeight: 20 },
  sectionTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  settings: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowLabel: { flex: 1, fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 20 + spacing.md },
  devReset: { alignItems: 'center', marginTop: spacing.xl },
  devResetText: { fontSize: font.small, color: colors.faint, textDecorationLine: 'underline' },
});
