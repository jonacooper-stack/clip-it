import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { AgeBracket } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR - 4; // youngest we let through the gate
const MIN_YEAR = CURRENT_YEAR - 100;

function bracketFor(age: number): AgeBracket {
  if (age < 13) return 'under_13';
  if (age < 18) return '13_17';
  return 'adult';
}

export default function AgeGate() {
  const router = useRouter();
  const setAge = useAppStore((s) => s.setAge);
  const [text, setText] = useState('');

  const year = /^\d{4}$/.test(text) ? Number(text) : null;
  const valid = year != null && year >= MIN_YEAR && year <= MAX_YEAR;
  const outOfRange = year != null && !valid; // four digits entered, but not a viable year
  const age = valid ? CURRENT_YEAR - year! : null;
  const bracket = age != null ? bracketFor(age) : null;
  const isChild = bracket === 'under_13';

  // Numbers only, capped at four digits.
  const onChangeText = (t: string) => setText(t.replace(/[^0-9]/g, '').slice(0, 4));

  const onContinue = () => {
    if (!bracket) return;
    setAge(bracket, isChild);
    // With accounts enabled, create/sign in next; otherwise go straight to ethos.
    router.push(isSupabaseConfigured ? '/onboarding/account' : '/onboarding/ethos');
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <View style={styles.iconBadge}>
          <Ionicons name="calendar-outline" size={26} color={colors.accent} />
        </View>
        <Text style={styles.title}>What year were you born?</Text>
        <Text style={styles.subtitle}>
          Type the four digits of your birth year. We store your age range, never your full birth
          date.
        </Text>
      </View>

      <View style={[styles.readout, valid && styles.readoutActive]}>
        <Text style={[styles.readoutLabel, valid && styles.readoutLabelActive]}>BIRTH YEAR</Text>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          placeholder="YYYY"
          placeholderTextColor={colors.faint}
          style={[styles.input, valid && styles.inputActive, webInputReset]}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onContinue}
          accessibilityLabel="Birth year, four digits"
        />
        {age != null && (
          <Text style={styles.readoutAge}>{`You're ${age} · ${bracketLabel(bracket!)}`}</Text>
        )}
      </View>

      {outOfRange && (
        <Text style={styles.error}>{`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`}</Text>
      )}

      {isChild && (
        <Card style={styles.childNote}>
          <View style={styles.childHead}>
            <Ionicons name="people" size={18} color={colors.accentInk} />
            <Text style={styles.childTitle}>A grown-up should help</Text>
          </View>
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
        disabled={!valid}
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

// react-native-web renders TextInput as an <input> that carries a default border
// and focus outline. Strip both on web only (these keys are no-ops on native).
const webInputReset: any =
  Platform.OS === 'web'
    ? { outlineStyle: 'none', borderWidth: 0, backgroundColor: 'transparent' }
    : null;

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.lg },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: font.title + 2, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, lineHeight: 21 },

  readout: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
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
  readoutLabelActive: { color: colors.onPrimary },
  input: {
    fontSize: 56,
    fontFamily: fonts.display,
    color: colors.text,
    lineHeight: 64,
    letterSpacing: 10,
    textAlign: 'center',
    minWidth: 220,
    paddingVertical: spacing.xs,
  },
  inputActive: { color: colors.white },
  readoutAge: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.onPrimary, marginTop: spacing.xs },

  error: {
    fontSize: font.small,
    fontFamily: fonts.bodyBold,
    color: colors.danger,
    marginBottom: spacing.md,
  },

  childNote: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  childHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  childTitle: {
    fontSize: font.body,
    fontFamily: fonts.heading,
    color: colors.accentInk,
  },
  childText: { fontSize: font.small, color: colors.accentInk, lineHeight: 20 },

  cta: { marginTop: spacing.sm },
});
