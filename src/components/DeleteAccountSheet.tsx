import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { deleteMyAccount } from '@/lib/account';

// Deleting an account is irreversible, so the flow is deliberate: say exactly what
// goes, then require the word DELETE. That's friction on purpose — it's the one
// destructive action in the app that can't be undone.

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountSheet({
  visible,
  email,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  email?: string;
  onClose: () => void;
  /** The account is gone — clear local state and send the user back to onboarding. */
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTyped('');
      setBusy(false);
      setError(null);
    }
  }, [visible]);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const confirm = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteMyAccount();
    setBusy(false);
    if (res.error) return setError(res.error);
    onDeleted();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.icon}>
            <Ionicons name="trash" size={26} color={colors.danger} />
          </View>
          <Text style={styles.title}>Delete your account?</Text>
          {!!email && <Text style={styles.email}>{email}</Text>}

          <Text style={styles.lead}>This is permanent. It can't be undone, and we can't restore it.</Text>

          <Text style={styles.listHead}>What gets deleted</Text>
          <Item>Your account and sign-in</Item>
          <Item>Your profile, display name, and profile picture</Item>
          <Item>Every post you've shared to the wall, and its photo</Item>
          <Item>Your comments, likes, follows, and friendships</Item>

          <Text style={styles.listHead}>What stays</Text>
          <Item muted>
            Your field journal lives on this phone, not our servers — it goes when you delete the
            app. Photos you saved to your camera roll are yours and stay there.
          </Item>

          <Text style={styles.prompt}>{`Type ${CONFIRM_WORD} to confirm`}</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={colors.faint}
            style={[styles.input, armed && styles.inputArmed, webInputReset]}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm deletion`}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.delete, (!armed || busy) && styles.deleteOff]}
            onPress={confirm}
            disabled={!armed || busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.deleteText}>Delete my account</Text>
            )}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>Keep my account</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Item({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <View style={styles.item}>
      <View style={[styles.dot, muted && styles.dotMuted]} />
      <Text style={[styles.itemText, muted && styles.itemTextMuted]}>{children}</Text>
    </View>
  );
}

const webInputReset: any = Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  icon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.dangerSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  title: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  email: { fontSize: font.small, color: colors.muted, marginTop: 2 },
  lead: { fontSize: font.small, color: colors.danger, lineHeight: 21, marginTop: spacing.sm },
  listHead: {
    fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.faint,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  item: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.danger, marginTop: 8 },
  dotMuted: { backgroundColor: colors.faint },
  itemText: { flex: 1, fontSize: font.small, color: colors.text, lineHeight: 20 },
  itemTextMuted: { color: colors.muted },
  prompt: { fontSize: font.small, fontFamily: fonts.bodyMedium, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs },
  input: {
    borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: font.body, fontFamily: fonts.bodyBold, letterSpacing: 2, color: colors.text,
  },
  inputArmed: { borderColor: colors.danger, color: colors.danger },
  error: { fontSize: font.small, color: colors.danger, marginTop: spacing.sm },
  delete: {
    backgroundColor: colors.danger, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  deleteOff: { opacity: 0.4 },
  deleteText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.white },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.muted },
});
