import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { colors, spacing, font, fonts, radius } from '@/theme';
import type { ScienceQuestion } from '@/lib/scienceQuestions';

export function ScienceQuestions({
  questions,
  answers,
  onAnswer,
}: {
  questions: ScienceQuestion[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
}) {
  const answered = questions.filter((q) => answers[q.id]).length;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Ionicons name="flask" size={16} color={colors.accent} />
          <Text style={styles.title}>Help science</Text>
        </View>
        <Text style={styles.bonus}>{answered > 0 ? `+${answered}` : 'optional'}</Text>
      </View>
      <Text style={styles.sub}>
        Tap an answer to add a bonus point. Skip anything you're not sure about.
      </Text>

      {questions.map((q) => (
        <View key={q.id} style={styles.q}>
          <Text style={styles.prompt}>{q.prompt}</Text>
          <Text style={styles.why}>{q.why}</Text>
          <View style={styles.options}>
            {q.options.map((o) => {
              const selected = answers[q.id] === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => onAnswer(q.id, o.value)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', marginTop: spacing.md, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  bonus: { fontSize: font.small, fontFamily: fonts.display, color: colors.accent },
  sub: { fontSize: font.small, color: colors.muted, marginTop: 2, marginBottom: spacing.md, lineHeight: 19 },
  q: { marginBottom: spacing.md },
  prompt: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.text },
  why: { fontSize: font.tiny, color: colors.faint, marginTop: 1, marginBottom: spacing.sm, lineHeight: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.small, fontFamily: fonts.bodyMedium, color: colors.text },
  chipTextSelected: { color: colors.white },
});
