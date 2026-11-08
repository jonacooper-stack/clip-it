import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { updateDisplayName, friendlyError } from '@/lib/social';

const webInputReset: any = Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

// Profile → Display name. The name other players see on the wall, comments and
// leaderboard (Google/Apple sign-in fill in your real name by default).
export default function EditName() {
  const router = useRouter();
  const current = useAppStore((s) => s.displayName);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await updateDisplayName(name);
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else goBack();
  };

  const changed = name.trim() !== current.trim();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Display name</Text>
        <View style={styles.iconBtn} />
      </View>
      <View style={styles.content}>
        <Text style={styles.note}>
          This is the name other explorers see on the wall, in comments and on the leaderboard. It doesn’t
          have to be your real name.
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={30}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={save}
          placeholder="Your display name"
          placeholderTextColor={colors.faint}
          style={[styles.input, webInputReset]}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="Save" icon="checkmark" onPress={save} loading={busy} disabled={!changed} style={styles.cta} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  content: { padding: spacing.lg },
  note: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginBottom: spacing.md },
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
  error: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.danger, marginTop: spacing.sm },
  cta: { marginTop: spacing.lg },
});
