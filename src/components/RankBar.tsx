import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { rankFor } from '@/lib/rank';
import { ProgressBar } from './ProgressBar';

// The player's explorer rank and how far it is to the next one.
export function RankBar({ points }: { points: number }) {
  const r = rankFor(points);
  return (
    <View style={styles.card} accessibilityLabel={`Rank: ${r.rank.name}. ${r.next ? `${r.toNext} points to ${r.next.name}` : 'Top rank'}`}>
      <View style={styles.row}>
        <Text style={styles.name}>{r.rank.name}</Text>
        <Text style={styles.count}>{r.next ? `${points} / ${r.next.from}` : `${points} points`}</Text>
      </View>
      <View style={styles.bar}>
        <ProgressBar value={r.next ? r.into : 1} goal={r.next ? r.span : 1} />
      </View>
      <Text style={styles.next}>{r.next ? `${r.toNext} ${r.toNext === 1 ? 'point' : 'points'} to ${r.next.name}` : 'You’ve reached the top rank'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { fontSize: font.body + 1, fontFamily: fonts.heading, color: colors.text },
  count: { fontSize: font.tiny, fontFamily: fonts.headingMd, color: colors.faint, letterSpacing: 1 },
  bar: { flexDirection: 'row' },
  next: { fontSize: font.tiny, color: colors.muted },
});
