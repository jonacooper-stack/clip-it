import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { SightingThumb } from '@/components/SightingThumb';
import { PointsBadge } from '@/components/PointsBadge';
import { TopoBackground } from '@/components/TopoBackground';
import { WildlifeGallery } from '@/components/WildlifeGallery';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';
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
  // Include still-queued captures (rapid-fire / offline) so a burst is visible
  // and the player can watch each one resolve from "queued" to a scored species.
  const recent = useMemo(
    () => sightings.filter((s) => s.species || s.idStatus === 'queued').slice(0, 8),
    [sightings],
  );

  const nextQuest = useMemo(
    () => SEED_QUESTS.find((q) => questProgress(q, sightings) < q.goal) ?? null,
    [sightings],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TopoBackground color={colors.primary} opacity={0.05} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{displayName}</Text>
          </View>
          {streak > 0 && (
            <View style={styles.streak}>
              <Ionicons name="flame" size={15} color={colors.accent} />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
          )}
        </View>

        <View style={styles.stats}>
          <View style={[styles.statCard, styles.statPrimary]}>
            <Text style={[styles.statValue, styles.statValueOnDark]}>{points}</Text>
            <Text style={[styles.statLabel, styles.statLabelOnDark]}>points</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{speciesCount}</Text>
            <Text style={styles.statLabel}>species</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{sightings.length}</Text>
            <Text style={styles.statLabel}>sightings</Text>
          </View>
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

        <Button
          label="Go Spot"
          variant="accent"
          icon="camera"
          onPress={() => router.push('/capture/camera')}
          style={styles.cta}
        />

        <Text style={styles.sectionTitle}>Recently spotted</Text>
        {recent.length === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="camera-outline" size={34} color={colors.faint} style={styles.emptyIcon} />
            <Text style={styles.emptyText}>
              Nothing here yet. Head outside and photograph your first wild animal!
            </Text>
          </Card>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentRow}
          >
            {recent.map((s) => (
              <Pressable
                key={s.id}
                style={styles.recentItem}
                onPress={() => router.push(`/sighting/${s.id}`)}
              >
                <SightingThumb
                  photoUri={s.photoUri}
                  scientificName={s.species?.scientificName}
                  size={72}
                />
                <Text style={styles.recentName} numberOfLines={1}>
                  {s.species?.commonName ?? (s.idStatus === 'queued' ? 'Queued' : 'Identifying…')}
                </Text>
                {s.idStatus === 'queued' ? (
                  <Text style={styles.pending}>queued</Text>
                ) : (
                  <Text style={styles.recentPts}>{s.points ?? 0} pts</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.discover}>
          <Text style={styles.sectionTitle}>Out in the wild</Text>
          <WildlifeGallery limit={8} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1 },
  greeting: { fontSize: font.body, color: colors.muted, fontFamily: fonts.bodyMedium },
  name: { fontSize: font.title + 2, fontFamily: fonts.heading, color: colors.text },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streakFlame: { fontSize: font.body },
  streakText: { fontSize: font.heading, fontFamily: fonts.display, color: colors.accentInk },

  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  statPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  statValue: { fontSize: font.title + 2, fontFamily: fonts.display, color: colors.primary },
  statValueOnDark: { color: colors.white },
  statLabel: {
    fontSize: font.tiny,
    color: colors.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: fonts.bodyBold,
  },
  statLabelOnDark: { color: colors.onPrimary },

  questCard: { marginBottom: spacing.lg },
  questHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  questLabel: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.accent, letterSpacing: 1 },
  questTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  questDesc: { fontSize: font.small, color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  questProgress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questCount: {
    fontSize: font.small,
    fontFamily: fonts.bodyBold,
    color: colors.muted,
    width: 44,
    textAlign: 'right',
  },

  cta: { marginBottom: spacing.xl },
  discover: { marginTop: spacing.xl },
  sectionTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.md },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIcon: { marginBottom: spacing.sm },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  recentRow: { gap: spacing.md, paddingRight: spacing.lg },
  recentItem: { width: 76, alignItems: 'center' },
  recentThumb: { width: 72, height: 72, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  recentName: {
    fontSize: font.tiny,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  recentPts: { fontSize: font.tiny, color: colors.accentInk, fontFamily: fonts.display },
  pending: { fontSize: font.tiny, color: colors.muted, fontStyle: 'italic' },
});
