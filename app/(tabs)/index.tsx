import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { PointsBadge } from '@/components/PointsBadge';
import { colors, spacing, font, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useJournalStore, totalPoints, distinctSpecies } from '@/state/useJournalStore';
import { SEED_QUESTS, questProgress } from '@/lib/quests';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const router = useRouter();
  const displayName = useAppStore((s) => s.displayName);
  const streak = useAppStore((s) => s.streakCount);
  const sightings = useJournalStore((s) => s.sightings);

  const points = useMemo(() => totalPoints(sightings), [sightings]);
  const speciesCount = useMemo(() => distinctSpecies(sightings).length, [sightings]);
  const recent = useMemo(() => sightings.filter((s) => s.species).slice(0, 8), [sightings]);

  const nextQuest = useMemo(
    () => SEED_QUESTS.find((q) => questProgress(q, sightings) < q.goal) ?? null,
    [sightings],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{displayName}</Text>
          </View>
          {streak > 0 && (
            <View style={styles.streak}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
        </View>

        <View style={styles.stats}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{points}</Text>
            <Text style={styles.statLabel}>points</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{speciesCount}</Text>
            <Text style={styles.statLabel}>species</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{sightings.length}</Text>
            <Text style={styles.statLabel}>sightings</Text>
          </Card>
        </View>

        {nextQuest && (
          <Card style={styles.questCard} onPress={() => router.push('/quests')}>
            <View style={styles.questHead}>
              <Text style={styles.questLabel}>TODAY'S QUEST</Text>
              <PointsBadge points={nextQuest.rewardPoints} prefix />
            </View>
            <Text style={styles.questTitle}>{nextQuest.title}</Text>
            <Text style={styles.questDesc}>{nextQuest.description}</Text>
            <View style={styles.questProgress}>
              <ProgressBar value={questProgress(nextQuest, sightings)} goal={nextQuest.goal} />
              <Text style={styles.questCount}>
                {questProgress(nextQuest, sightings)}/{nextQuest.goal}
              </Text>
            </View>
          </Card>
        )}

        <Button label="Go Spot" icon="camera" onPress={() => router.push('/capture/camera')} style={styles.cta} />

        <Text style={styles.sectionTitle}>Recent catches</Text>
        {recent.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔭</Text>
            <Text style={styles.emptyText}>No catches yet. Head outside and photograph your first animal!</Text>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
            {recent.map((s) => (
              <Pressable key={s.id} style={styles.recentItem} onPress={() => router.push(`/sighting/${s.id}`)}>
                <SpeciesAvatar scientificName={s.species?.scientificName} size={72} />
                <Text style={styles.recentName} numberOfLines={1}>
                  {s.species?.commonName}
                </Text>
                {s.idStatus === 'needs_review' ? (
                  <Text style={styles.pending}>pending</Text>
                ) : (
                  <Text style={styles.recentPts}>{s.points ?? 0} pts</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  greeting: { fontSize: font.body, color: colors.muted },
  name: { fontSize: font.title, fontWeight: '800', color: colors.text },
  streak: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  streakText: { fontSize: font.body, fontWeight: '800', color: '#9A6A00' },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statValue: { fontSize: font.title, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: font.tiny, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  questCard: { marginBottom: spacing.lg },
  questHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  questLabel: { fontSize: font.tiny, fontWeight: '800', color: colors.accent, letterSpacing: 1 },
  questTitle: { fontSize: font.heading, fontWeight: '800', color: colors.text },
  questDesc: { fontSize: font.small, color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  questProgress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questCount: { fontSize: font.small, fontWeight: '700', color: colors.muted, width: 44, textAlign: 'right' },
  cta: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: font.heading, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  recentRow: { gap: spacing.md, paddingRight: spacing.lg },
  recentItem: { width: 76, alignItems: 'center' },
  recentName: { fontSize: font.tiny, color: colors.text, fontWeight: '600', marginTop: spacing.xs, textAlign: 'center' },
  recentPts: { fontSize: font.tiny, color: colors.accent, fontWeight: '800' },
  pending: { fontSize: font.tiny, color: colors.muted, fontStyle: 'italic' },
});
