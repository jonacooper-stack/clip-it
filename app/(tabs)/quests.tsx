import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { PointsBadge } from '@/components/PointsBadge';
import { colors, spacing, font, fonts } from '@/theme';
import { SEED_QUESTS, questProgress } from '@/lib/quests';
import { useQuestSightings } from '@/lib/useQuestSightings';
import { CrewAvatar } from '@/components/crew/CrewAvatar';
import { useScoutFeed } from '@/lib/crew/useScoutFeed';
import { SWEEP_BONUS } from '@/lib/crew/challenges';
import { addWeeks, DAY_MS, startOfWeek } from '@/lib/crew/time';

export default function Quests() {
  const router = useRouter();
  const sightings = useQuestSightings(); // what counts toward the score
  const { quests: weekly } = useScoutFeed();
  const weeklyDone = weekly.filter((c) => c.done).length;
  const daysLeft = Math.max(0, Math.ceil((addWeeks(startOfWeek(Date.now()), 1) - Date.now()) / DAY_MS) - 1);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/feed');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={styles.backText}>Feed</Text>
        </Pressable>
        <Text style={styles.title}>Quests</Text>
        <Text style={styles.subtitle}>Things to chase on your next outing.</Text>

        <View style={styles.scoutRow}>
          <CrewAvatar size={34} />
          <View style={{ flex: 1 }}>
            <Text style={styles.section}>This week from Scout</Text>
            <Text style={styles.sectionSub}>
              {weeklyDone === weekly.length && weekly.length
                ? `All done! +${SWEEP_BONUS} bonus points. New quests on Monday.`
                : `New quests every Monday · ${daysLeft ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : 'last day!'} · finish all 3 for +${SWEEP_BONUS}`}
            </Text>
          </View>
        </View>
        {weekly.map((c) => (
          <Card key={c.def.id} style={styles.card}>
            <View style={styles.head}>
              <View style={styles.titleRow}>
                <Text style={styles.emoji}>{c.def.emoji}</Text>
                <Text style={[styles.questTitle, c.done && styles.questDone]}>{c.def.title}</Text>
                {c.done && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
              </View>
              <PointsBadge points={c.def.reward} prefix />
            </View>
            <Text style={styles.desc}>{c.def.description}</Text>
            <View style={styles.progressRow}>
              <ProgressBar value={c.progress} goal={c.def.goal} />
              <Text style={styles.count}>
                {c.progress}/{c.def.goal}
              </Text>
            </View>
          </Card>
        ))}

        <Text style={[styles.section, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Big quests</Text>
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm, marginLeft: -4 },
  backText: { fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: 2, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  scoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  section: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  sectionSub: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  emoji: { fontSize: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  questTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  questDone: { color: colors.primary },
  desc: { fontSize: font.small, color: colors.muted, marginBottom: spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted, width: 44, textAlign: 'right' },
});
