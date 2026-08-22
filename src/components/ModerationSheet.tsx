import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, fonts, radius } from '@/theme';
import {
  REPORT_REASONS, reportContent, blockUser,
  type ReportReason, type ReportTargetType,
} from '@/lib/moderation';

// The report / block sheet for someone else's post or comment.
//
// A Modal rather than Alert.alert: Alert takes at most three buttons on Android
// and is barely implemented on react-native-web, and this flow needs a reason
// list. One component so the wall, the post screen, and comments all offer the
// identical path — which is what a reviewer checks for.

export interface ModerationTarget {
  type: ReportTargetType;
  /** Set for a post report, or the post a reported comment belongs to. */
  postId?: string;
  commentId?: string;
  /** The author — who gets blocked, and who a 'user' report is about. */
  userId: string;
  displayName: string;
}

type Step = 'menu' | 'reason' | 'sent';

export function ModerationSheet({
  target,
  onClose,
  onBlocked,
  onReported,
}: {
  target: ModerationTarget | null;
  onClose: () => void;
  /** The author was blocked — drop their content from the current list. */
  onBlocked?: (userId: string) => void;
  onReported?: () => void;
}) {
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time a new target opens the sheet, so it never reopens
  // mid-flow from the last one.
  useEffect(() => {
    if (target) {
      setStep('menu');
      setReason(null);
      setDetails('');
      setBusy(false);
      setError(null);
    }
  }, [target]);

  if (!target) return null;

  const noun = target.type === 'comment' ? 'comment' : 'post';

  const submitReport = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const res = await reportContent({
      targetType: target.type,
      postId: target.postId,
      commentId: target.commentId,
      targetUserId: target.userId,
      reason,
      details,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    onReported?.();
    setStep('sent');
  };

  const doBlock = async () => {
    setBusy(true);
    setError(null);
    const res = await blockUser(target.userId);
    setBusy(false);
    if (res.error) return setError(res.error);
    onBlocked?.(target.userId);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        {step === 'menu' && (
          <>
            <Text style={styles.title}>{target.displayName}</Text>
            <Action
              icon="flag-outline"
              label={`Report this ${noun}`}
              hint="Tell us what's wrong and we'll review it."
              onPress={() => setStep('reason')}
            />
            <Action
              icon="ban-outline"
              label={`Block ${target.displayName}`}
              hint="You won't see each other's posts, comments, or profile."
              danger
              onPress={doBlock}
              busy={busy}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </>
        )}

        {step === 'reason' && (
          <>
            <Text style={styles.title}>{`Report this ${noun}`}</Text>
            <Text style={styles.subtitle}>What's the problem?</Text>
            <ScrollView style={styles.reasons} keyboardShouldPersistTaps="handled">
              {REPORT_REASONS.map((r) => (
                <Pressable key={r.value} style={styles.reasonRow} onPress={() => setReason(r.value)}>
                  <Ionicons
                    name={reason === r.value ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={reason === r.value ? colors.primary : colors.faint}
                  />
                  <Text style={[styles.reasonLabel, reason === r.value && styles.reasonLabelOn]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Anything else we should know? (optional)"
                placeholderTextColor={colors.faint}
                style={[styles.details, webInputReset]}
                multiline
                maxLength={500}
              />
            </ScrollView>
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={[styles.submit, (!reason || busy) && styles.submitOff]}
              onPress={submitReport}
              disabled={!reason || busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitText}>Submit report</Text>
              )}
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setStep('menu')}>
              <Text style={styles.cancelText}>Back</Text>
            </Pressable>
          </>
        )}

        {step === 'sent' && (
          <>
            <View style={styles.sentIcon}>
              <Ionicons name="checkmark" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Thanks — we're on it</Text>
            <Text style={styles.subtitle}>
              {`We review every report, usually within 24 hours, and remove anything that breaks the rules. If you'd rather not see ${target.displayName} at all, you can block them.`}
            </Text>
            <Action
              icon="ban-outline"
              label={`Block ${target.displayName}`}
              hint="You won't see each other's posts, comments, or profile."
              danger
              onPress={doBlock}
              busy={busy}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Done</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

function Action({
  icon,
  label,
  hint,
  danger,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  danger?: boolean;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator color={danger ? colors.danger : colors.text} style={styles.actionIcon} />
      ) : (
        <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.text} style={styles.actionIcon} />
      )}
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, danger && { color: colors.danger }]}>{label}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
    </Pressable>
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
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginBottom: spacing.md },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionPressed: { opacity: 0.6 },
  actionIcon: { width: 24, textAlign: 'center' },
  actionText: { flex: 1 },
  actionLabel: { fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  actionHint: { fontSize: font.tiny, color: colors.muted, marginTop: 2, lineHeight: 16 },
  reasons: { marginBottom: spacing.sm },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
  reasonLabel: { flex: 1, fontSize: font.small, color: colors.muted },
  reasonLabelOn: { color: colors.text, fontFamily: fonts.bodyMedium },
  details: {
    marginTop: spacing.sm,
    minHeight: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    fontSize: font.small,
    color: colors.text,
    textAlignVertical: 'top',
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  submitOff: { opacity: 0.45 },
  submitText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.white },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.muted },
  error: { fontSize: font.small, color: colors.danger, marginTop: spacing.sm },
  sentIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
