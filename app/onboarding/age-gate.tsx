import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import type { AgeBracket } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 86 }, (_, i) => CURRENT_YEAR - 4 - i); // 4..89 yrs old

function bracketFor(age: number): AgeBracket {
  if (age < 13) return 'under_13';
  if (age < 18) return '13_17';
  return 'adult';
}

export default function AgeGate() {
  const router = useRouter();
  const setAge = useAppStore((s) => s.setAge);
  const [year, setYear] = useState<number | null>(null);

  const age = year ? CURRENT_YEAR - year : null;
  const bracket = age != null ? bracketFor(age) : null;
  const isChild = bracket === 'under_13';

  const onContinue = () => {
    if (!bracket) return;
    setAge(bracket, isChild);
    router.push('/onboarding/ethos');
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>When's your birthday?</Text>
        <Text style={styles.subtitle}>
          We ask so we can keep the experience age-appropriate. We store your age range, not your
          full birth date.
        </Text>
      </View>

      <Text style={styles.label}>Birth year</Text>
      <FlatList
        data={YEARS}
        keyExtractor={(y) => String(y)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.yearRow}
        renderItem={({ item }) => {
          const selected = item === year;
          return (
            <Pressable
              onPress={() => setYear(item)}
              style={[styles.yearChip, selected && styles.yearChipSelected]}
            >
              <Text style={[styles.yearText, selected && styles.yearTextSelected]}>{item}</Text>
            </Pressable>
          );
        }}
      />

      {isChild && (
        <Card style={styles.childNote}>
          <Text style={styles.childTitle}>👋 A grown-up should help</Text>
          <Text style={styles.childText}>
            Since you're under 13, a parent or guardian needs to set up and approve your profile,
            and we keep extra-strict privacy protections on your account.
          </Text>
        </Card>
      )}

      <View style={styles.spacer} />
      <Button label="Continue" onPress={onContinue} disabled={!bracket} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.xl, marginBottom: spacing.lg },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, lineHeight: 20 },
  label: { fontSize: font.small, fontWeight: '700', color: colors.muted, marginBottom: spacing.sm },
  yearRow: { paddingVertical: spacing.xs, gap: spacing.sm },
  yearChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  yearText: { fontSize: font.body, fontWeight: '700', color: colors.text },
  yearTextSelected: { color: colors.white },
  childNote: { marginTop: spacing.lg, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  childTitle: { fontSize: font.body, fontWeight: '800', color: '#7A5300', marginBottom: spacing.xs },
  childText: { fontSize: font.small, color: '#7A5300', lineHeight: 20 },
  spacer: { flex: 1 },
});
