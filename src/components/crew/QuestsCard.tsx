import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CrewAvatar } from './CrewAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { SWEEP_BONUS, type ChallengeStatus } from '@/lib/crew/challenges';
import { addWeeks, DAY_MS, startOfWeek } from '@/lib/crew/time';

// Pinned at the top of the feed: Scout's three quests for this week.
export function QuestsCard({ quests }: { quests: ChallengeStatus[] }) {
  const router = useRouter();
  const done = quests.filter((c) => c.done).length;
  const daysLeft = Math.max(0, Math.ceil((addWeeks(startOfWeek(Date.now()), 1) - Date.now()) / DAY_MS) - 1);
  const all = quests.length > 0 && done === quests.length;
  return (
    <Pressable onPress={() => router.push('/quests')} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.head}>
        <CrewAvatar crew="scout" size={28} />
        <Text style={styles.title}>{all ? 'All quests done! 🏆' : 'Your quests this week'}</Text>
        <Text style={styles.days}>{all ? `+${SWEEP_BONUS} bonus` : daysLeft ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : 'Last day!'}</Text>
      </View>
      {quests.map((c) => (
        <View key={c.def.id} style={styles.row}>
          <Text style={styles.emoji}>{c.def.emoji}</Text>
          <Text style={[styles.desc, c.done && styles.descDone]} numberOfLines={2}>
            {c.def.description}
          </Text>
          {c.done ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          ) : (
            <Text style={styles.progress}>
              {c.progress}/{c.def.goal}
            </Text>
          )}
          <Text style={styles.reward}>+{c.def.reward}</Text>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  title: { flex: 1, fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  days: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.accentInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 16, width: 22, textAlign: 'center' },
  desc: { flex: 1, fontSize: font.small, color: colors.text },
  descDone: { color: colors.muted, textDecorationLine: 'line-through' },
  progress: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted },
  reward: { width: 34, textAlign: 'right', fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.accentInk },
});
