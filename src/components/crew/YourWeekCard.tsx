import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CrewAvatar } from './CrewAvatar';
import { CrewBadge } from '@/components/social/CrewBadge';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { CREW } from '../../../shared/crew';
import type { ChallengeStatus } from '@/lib/crew/challenges';
import type { DuelState } from '@/lib/crew/duel';

// Pinned at the top of the feed: this week's challenges (Moss) and the duel
// (Kestrel), always current.
export function YourWeekCard({ challenges, duel }: { challenges: ChallengeStatus[]; duel: DuelState }) {
  const router = useRouter();
  const done = challenges.filter((c) => c.done).length;
  const max = Math.max(duel.you, duel.kestrel, 1);
  return (
    <Pressable onPress={() => router.push('/crew')} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.head}>
        <View style={styles.avatars}>
          <CrewAvatar crew="moss" size={30} />
          <View style={styles.overlap}>
            <CrewAvatar crew="kestrel" size={30} />
          </View>
        </View>
        <Text style={styles.title}>Your week</Text>
        <CrewBadge small />
        <Text style={styles.days}>{duel.daysLeft ? `${duel.daysLeft}d left` : 'Last day'}</Text>
      </View>

      <Text style={styles.section}>
        Moss’s challenges · <Text style={{ color: CREW.moss.color }}>{done}/3</Text>
      </Text>
      {challenges.map((c) => (
        <View key={c.def.id} style={styles.cRow}>
          <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={c.done ? CREW.moss.color : colors.faint} />
          <Text style={[styles.cTitle, c.done && { color: CREW.moss.color }]} numberOfLines={1}>{c.def.title}</Text>
          <View style={styles.cBar}>
            <View style={[styles.cFill, { width: `${Math.round((c.progress / c.def.goal) * 100)}%` }]} />
          </View>
          <Text style={styles.cReward}>+{c.def.reward}</Text>
        </View>
      ))}

      <Text style={[styles.section, { marginTop: spacing.sm }]}>Duel with Kestrel · winner +15</Text>
      <View style={styles.duelRow}>
        <Text style={styles.who}>You</Text>
        <View style={styles.track}>
          <View style={[styles.youBar, { width: `${Math.round((duel.you / max) * 100)}%` }]} />
        </View>
        <Text style={[styles.score, { color: colors.primary }]}>{duel.you}</Text>
      </View>
      <View style={styles.duelRow}>
        <Text style={styles.who}>Kestrel</Text>
        <View style={styles.track}>
          <View style={[styles.kBar, { width: `${Math.round((duel.kestrel / max) * 100)}%` }]} />
        </View>
        <Text style={[styles.score, { color: CREW.kestrel.color }]}>{duel.kestrel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  avatars: { flexDirection: 'row' },
  overlap: { marginLeft: -10, borderRadius: 16, borderWidth: 2, borderColor: colors.surface },
  title: { fontSize: font.body + 1, fontFamily: fonts.heading, color: colors.text },
  days: { marginLeft: 'auto', fontSize: font.tiny, color: colors.muted },
  section: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  cRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cTitle: { width: 118, fontSize: font.small, color: colors.text },
  cBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  cFill: { height: '100%', backgroundColor: CREW.moss.color },
  cReward: { width: 30, textAlign: 'right', fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.accentInk },
  duelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { width: 52, fontSize: font.small, color: colors.text },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  youBar: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
  kBar: { height: '100%', backgroundColor: CREW.kestrel.color, borderRadius: 5 },
  score: { width: 34, textAlign: 'right', fontSize: font.body, fontFamily: fonts.display },
});
