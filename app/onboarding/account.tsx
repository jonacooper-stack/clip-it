import { useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, TextInput, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore } from '@/state/useAuthStore';

// react-native-web renders TextInput as an <input> with a default border + focus
// outline; strip both on web only (no-ops on native).
const webInputReset: any =
  Platform.OS === 'web' ? { outlineStyle: 'none', borderWidth: 0, backgroundColor: 'transparent' } : null;

export default function Account() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const ageBracket = useAppStore((s) => s.ageBracket);
  const isChild = useAppStore((s) => s.isChild);
  const setOnboarded = useAppStore((s) => s.setOnboarded);
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);

  const [mode, setMode] = useState<'signup' | 'signin'>(params.mode === 'signin' ? 'signin' : 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const isSignup = mode === 'signup';
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = emailOk && password.length >= 6 && (!isSignup || name.trim().length >= 1);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = isSignup
      ? await signUp({ email, password, displayName: name, ageBracket, isChild })
      : await signIn(email, password);
    setBusy(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    if ('needsConfirmation' in res && res.needsConfirmation) {
      setSent(true);
      return;
    }
    if (isSignup) {
      // Continue onboarding; ethos marks the user onboarded.
      router.replace('/onboarding/ethos');
    } else {
      // Returning user — their profile already exists, skip straight in.
      setOnboarded(true);
      router.replace('/');
    }
  };

  if (sent) {
    return (
      <ScreenContainer scroll>
        <View style={styles.iconBadge}>
          <Ionicons name="mail-unread-outline" size={26} color={colors.accent} />
        </View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to <Text style={styles.bold}>{email.trim()}</Text>. Tap it, then
          come back and sign in.
        </Text>
        <Button
          label="Back to sign in"
          variant="ghost"
          onPress={() => {
            setSent(false);
            setMode('signin');
          }}
          style={styles.cta}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.iconBadge}>
        <Ionicons name={isSignup ? 'person-add' : 'log-in'} size={24} color={colors.accent} />
      </View>
      <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
      <Text style={styles.subtitle}>
        {isSignup
          ? 'Your account saves your journal and points across devices.'
          : 'Sign in to pick up your journal where you left off.'}
      </Text>

      {isChild && isSignup && (
        <Card style={styles.childNote}>
          <View style={styles.childHead}>
            <Ionicons name="people" size={18} color={colors.accentInk} />
            <Text style={styles.childTitle}>A grown-up should set this up</Text>
          </View>
          <Text style={styles.childText}>
            Since you're under 13, a parent or guardian should create the account with their own email
            and stay involved.
          </Text>
        </Card>
      )}

      <View style={styles.form}>
        {isSignup && (
          <Field label="Display name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="What should we call you?"
              placeholderTextColor={colors.faint}
              style={[styles.input, webInputReset]}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </Field>
        )}
        <Field label="Email">
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.faint}
            style={[styles.input, webInputReset]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />
        </Field>
        <Field label="Password">
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.faint}
            style={[styles.input, webInputReset]}
            secureTextEntry
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Field>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Button
        label={isSignup ? 'Create account' : 'Sign in'}
        icon="arrow-forward"
        onPress={submit}
        disabled={!valid}
        loading={busy}
        style={styles.cta}
      />

      <Text style={styles.toggle} onPress={() => { setError(null); setMode(isSignup ? 'signin' : 'signup'); }}>
        {isSignup ? 'Already have an account? ' : 'New here? '}
        <Text style={styles.toggleLink}>{isSignup ? 'Sign in' : 'Create one'}</Text>
      </Text>
    </ScreenContainer>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { fontSize: font.title + 2, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, lineHeight: 21, marginBottom: spacing.lg },

  childNote: { marginBottom: spacing.lg, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  childHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  childTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.accentInk },
  childText: { fontSize: font.small, color: colors.accentInk, lineHeight: 20 },

  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: font.tiny, fontFamily: fonts.bodyBold, letterSpacing: 0.5, color: colors.muted, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: font.body,
    fontFamily: fonts.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },

  error: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.danger, marginTop: spacing.md },

  cta: { marginTop: spacing.lg },
  toggle: { fontSize: font.small, color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  toggleLink: { color: colors.primary, fontFamily: fonts.bodyBold },
  bold: { fontFamily: fonts.bodyBold, color: colors.text },
});
