import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { PointsBadge } from '@/components/PointsBadge';
import { colors, spacing, font, fonts } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { SEED_QUESTS, questProgress } from '@/lib/quests';

export default function Quests() {
  const sightings = useJournalStore((s) => s.sightings);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Quests</Text>
        <Text style={styles.subtitle}>Challenges to chase on your next outing.</Text>

        {SEED_QUESTS.map((q) => {
          const value = questProgress(q, sightings);
          const done = value >= q.goal;
          return (
            <Card key={q.id} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.titleRow}>
                  {done && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                  <Text style={[styles.questTitle, done && styles.questDone]}>{q.title}</Text>
                </View>
                <PointsBadge points={q.rewardPoints} prefix />
              </View>
              <Text style={styles.desc}>{q.description}</Text>
              <View style={styles.progressRow}>
                <ProgressBar value={value} goal={q.goal} />
                <Text style={styles.count}>
                  {value}/{q.goal}
                </Text>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: 2, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  questTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  questDone: { color: colors.primary },
  desc: { fontSize: font.small, color: colors.muted, marginBottom: spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted, width: 44, textAlign: 'right' },
});
