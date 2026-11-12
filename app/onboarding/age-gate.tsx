import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius, shadow } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore, syncAccountNow } from '@/state/useAuthStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { AgeBracket } from '@/types';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR - 4; // youngest year accepted as input (under-13s are then turned away)
const MIN_YEAR = CURRENT_YEAR - 100;

function bracketFor(age: number): AgeBracket {
  if (age < 13) return 'under_13';
  if (age < 18) return '13_17';
  return 'adult';
}

// How long the gate stays closed on this device after an under-13 year.
const BLOCK_MS = 24 * 3600_000;

export default function AgeGate() {
  const router = useRouter();
  const setAge = useAppStore((s) => s.setAge);
  const blockedUntil = useAppStore((s) => s.ageBlockedUntil);
  const setBlockedUntil = useAppStore((s) => s.setAgeBlockedUntil);
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const [text, setText] = useState('');

  const year = /^\d{4}$/.test(text) ? Number(text) : null;
  const valid = year != null && year >= MIN_YEAR && year <= MAX_YEAR;
  const outOfRange = year != null && !valid; // four digits entered, but not a viable year
  const age = valid ? CURRENT_YEAR - year! : null;
  const bracket = age != null ? bracketFor(age) : null;
  // ClipIt is 13+. The question is asked neutrally (no hint about the cut-off
  // while typing); an under-13 answer closes the gate on this device for a
  // day, so a different year can't just be entered straight afterwards.
  const blocked = blockedUntil != null && Date.now() < blockedUntil;

  // Numbers only, capped at four digits.
  const onChangeText = (t: string) => setText(t.replace(/[^0-9]/g, '').slice(0, 4));

  const onContinue = () => {
    if (!bracket || blocked) return;
    if (bracket === 'under_13') {
      setBlockedUntil(Date.now() + BLOCK_MS);
      // Someone who got an account another way (Google / Apple sign-in) can't keep using it.
      if (session) signOut().catch(() => {});
      return;
    }
    setAge(bracket, false);
    if (!isSupabaseConfigured) return router.push('/onboarding/ethos');
    // Not signed in yet: create an account / sign in next. Already signed in
    // (asked here after a Google or Apple sign-in): carry on where they were headed.
    if (!session) return router.push('/onboarding/account');
    syncAccountNow(); // save the age range on the account
    if (hasOnboarded) return router.replace('/feed');
    router.replace(useAppStore.getState().homeRegion ? '/onboarding/ethos' : '/region?next=/onboarding/ethos');
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

      {!blocked && (
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
          {age != null && <Text style={styles.readoutAge}>{`You're ${age}`}</Text>}
        </View>
      )}

      {outOfRange && !blocked && (
        <Text style={styles.error}>{`Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`}</Text>
      )}

      {blocked && (
        <Card style={styles.childNote}>
          <View style={styles.childHead}>
            <Ionicons name="leaf" size={18} color={colors.accentInk} />
            <Text style={styles.childTitle}>ClipIt is for ages 13 and up</Text>
          </View>
          <Text style={styles.childText}>
            Sorry, you need to be at least 13 to create a ClipIt account. In the meantime, keep exploring
            outside, and come back when you’re 13!
          </Text>
        </Card>
      )}

      <Button
        label="Continue"
        icon="arrow-forward"
        onPress={onContinue}
        disabled={!valid || blocked}
        style={styles.cta}
      />
    </ScreenContainer>
  );
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
