import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import type { AgeBracket } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR - 4; // youngest we let through the gate
const MIN_YEAR = CURRENT_YEAR - 100;

const DECADES: number[] = [];
for (let d = Math.floor(MAX_YEAR / 10) * 10; d >= Math.floor(MIN_YEAR / 10) * 10; d -= 10) {
  DECADES.push(d);
}

function yearsInDecade(decade: number): number[] {
  const out: number[] = [];
  for (let y = decade; y <= decade + 9; y++) {
    if (y >= MIN_YEAR && y <= MAX_YEAR) out.push(y);
  }
  return out;
}

function bracketFor(age: number): AgeBracket {
  if (age < 13) return 'under_13';
  if (age < 18) return '13_17';
  return 'adult';
}

export default function AgeGate() {
  const router = useRouter();
  const setAge = useAppStore((s) => s.setAge);
  const [decade, setDecade] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);

  const age = year ? CURRENT_YEAR - year : null;
  const bracket = age != null ? bracketFor(age) : null;
  const isChild = bracket === 'under_13';

  const decadeYears = useMemo(() => (decade != null ? yearsInDecade(decade) : []), [decade]);

  const onPickDecade = (d: number) => {
    setDecade(d);
    if (year != null && (year < d || year > d + 9)) setYear(null);
  };

  const onContinue = () => {
    if (!bracket) return;
    setAge(bracket, isChild);
    router.push('/onboarding/ethos');
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.emoji}>🦉</Text>
        <Text style={styles.title}>When's your birthday?</Text>
        <Text style={styles.subtitle}>
          We ask so we can keep the experience age-appropriate. We store your age range, never your
          full birth date.
        </Text>
      </View>

      <View style={[styles.readout, year != null && styles.readoutActive]}>
        <Text style={styles.readoutLabel}>BIRTH YEAR</Text>
        <Text style={[styles.readoutYear, !year && styles.readoutYearEmpty]}>
          {year ?? '— — — —'}
        </Text>
        {age != null && (
          <Text style={styles.readoutAge}>
            {`You're ${age} · ${bracketLabel(bracket!)}`}
          </Text>
        )}
      </View>

      <Text style={styles.step}>1 · Decade</Text>
      <View style={styles.chipWrap}>
        {DECADES.map((d) => {
          const selected = d === decade;
          return (
            <Pressable
              key={d}
              onPress={() => onPickDecade(d)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{`${d}s`}</Text>
            </Pressable>
          );
        })}
      </View>

      {decade != null && (
        <>
          <Text style={styles.step}>2 · Year</Text>
          <View style={styles.chipWrap}>
            {decadeYears.map((y) => {
              const selected = y === year;
              return (
                <Pressable
                  key={y}
                  onPress={() => setYear(y)}
                  style={[styles.yearChip, selected && styles.yearChipSelected]}
                >
                  <Text style={[styles.yearText, selected && styles.yearTextSelected]}>{y}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {isChild && (
        <Card style={styles.childNote}>
          <Text style={styles.childTitle}>👋 A grown-up should help</Text>
          <Text style={styles.childText}>
            Since you're under 13, a parent or guardian needs to set up and approve your profile, and
            we keep extra-strict privacy protections on your account.
          </Text>
        </Card>
      )}

      <Button
        label="Continue"
        icon="arrow-forward"
        onPress={onContinue}
        disabled={!bracket}
        style={styles.cta}
      />
    </ScreenContainer>
  );
}

function bracketLabel(b: AgeBracket): string {
  if (b === 'under_13') return 'Junior explorer';
  if (b === '13_17') return 'Teen explorer';
  return 'Explorer';
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.lg },
  emoji: { fontSize: 44, marginBottom: spacing.sm },
  title: { fontSize: font.title + 2, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, lineHeight: 21 },

  readout: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  readoutActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    ...shadow.card,
  },
  readoutLabel: {
    fontSize: font.tiny,
    fontFamily: fonts.bodyBold,
    letterSpacing: 2,
    color: colors.faint,
  },
  readoutYear: {
    fontSize: 56,
    fontFamily: fonts.display,
    color: colors.white,
    lineHeight: 62,
    letterSpacing: 2,
  },
  readoutYearEmpty: { color: colors.faint, letterSpacing: 6 },
  readoutAge: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.primarySoft },

  step: {
    fontSize: font.tiny,
    fontFamily: fonts.bodyBold,
    letterSpacing: 1.5,
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  chipTextSelected: { color: colors.white },

  yearChip: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  yearChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadow.soft,
  },
  yearText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.text },
  yearTextSelected: { color: colors.white },

  childNote: {
    marginBottom: spacing.lg,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  childTitle: {
    fontSize: font.body,
    fontFamily: fonts.heading,
    color: colors.accentInk,
    marginBottom: spacing.xs,
  },
  childText: { fontSize: font.small, color: colors.accentInk, lineHeight: 20 },

  cta: { marginTop: spacing.sm },
});
