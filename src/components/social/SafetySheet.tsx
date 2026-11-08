// Report + block sheet (App Store Guideline 1.2). One bottom sheet used for
// posts, comments and people: first "Report" / "Block", then a reason picker.
// A Modal (not Alert) so it works the same on iOS, Android and web, and isn't
// capped at Alert's button limit.
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { blockUser, reportContent, REPORT_REASONS, type ReportTarget } from '@/lib/social';

export interface SafetyTarget {
  type: ReportTarget;
  id: string; // post / comment / profile id
  userId: string; // the author
  displayName: string;
}

type Step = 'menu' | 'reasons' | 'confirmBlock' | 'done';

const NOUN: Record<ReportTarget, string> = { post: 'post', comment: 'comment', user: 'account' };

const webInputReset: any = Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') (globalThis as any).alert?.(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

export function SafetySheet({
  target,
  onClose,
  onBlocked,
  onReported,
}: {
  target: SafetyTarget | null;
  onClose: () => void;
  // Called after a block so the caller can drop that person's content at once.
  onBlocked?: (userId: string) => void;
  // Called after a report so the caller can hide the reported item for this user.
  onReported?: (target: SafetyTarget) => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setStep('menu');
      setReason(null);
      setDetails('');
      setAlsoBlock(false);
      setBusy(false);
    }
  }, [target]);

  if (!target) return null;
  const noun = NOUN[target.type];

  const doBlock = async () => {
    setBusy(true);
    const res = await blockUser(target.userId);
    setBusy(false);
    if (res.error) return notify('Couldn’t block', res.error);
    onBlocked?.(target.userId);
    onClose();
    notify('Blocked', `You won’t see ${target.displayName}’s posts or comments anymore. You can undo this in Profile → Blocked accounts.`);
  };

  const doReport = async () => {
    if (!reason) return;
    setBusy(true);
    const res = await reportContent({
      targetType: target.type,
      targetId: target.id,
      targetUserId: target.userId,
      reason,
      details,
    });
    if (res.error) {
      setBusy(false);
      return notify('Couldn’t send report', res.error);
    }
    if (alsoBlock) {
      const b = await blockUser(target.userId);
      if (!b.error) onBlocked?.(target.userId);
    }
    setBusy(false);
    onReported?.(target);
    setStep('done');
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onPress={() => {}}>
          <View style={styles.grabber} />

          {step === 'menu' && (
            <>
              <Option
                icon="flag-outline"
                label={`Report ${noun}`}
                danger
                onPress={() => setStep('reasons')}
              />
              <Option
                icon="ban-outline"
                label={`Block ${target.displayName}`}
                danger
                onPress={() => setStep('confirmBlock')}
              />
              <Option icon="close" label="Cancel" onPress={onClose} />
            </>
          )}

          {step === 'confirmBlock' && (
            <View style={styles.pad}>
              <Text style={styles.title}>Block {target.displayName}?</Text>
              <Text style={styles.body}>
                You won’t see their posts, comments or profile, and any follow or friendship between you is
                removed. They aren’t notified.
              </Text>
              <View style={styles.row}>
                <Pill label="Cancel" onPress={onClose} />
                <Pill label={busy ? '' : 'Block'} danger onPress={doBlock} busy={busy} />
              </View>
            </View>
          )}

          {step === 'reasons' && (
            <View style={styles.pad}>
              <Text style={styles.title}>Why are you reporting this {noun}?</Text>
              <Text style={styles.body}>Reports are private. Our team reviews every report within 24 hours.</Text>
              {REPORT_REASONS.map((r) => (
                <Pressable key={r} style={styles.reason} onPress={() => setReason(r)}>
                  <Ionicons
                    name={reason === r ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={reason === r ? colors.primary : colors.faint}
                  />
                  <Text style={styles.reasonText}>{r}</Text>
                </Pressable>
              ))}
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Anything else we should know? (optional)"
                placeholderTextColor={colors.faint}
                style={[styles.input, webInputReset]}
                multiline
                maxLength={500}
              />
              <Pressable style={styles.reason} onPress={() => setAlsoBlock((v) => !v)}>
                <Ionicons name={alsoBlock ? 'checkbox' : 'square-outline'} size={20} color={alsoBlock ? colors.primary : colors.faint} />
                <Text style={styles.reasonText}>Also block {target.displayName}</Text>
              </Pressable>
              <View style={styles.row}>
                <Pill label="Cancel" onPress={onClose} />
                <Pill label={busy ? '' : 'Send report'} danger disabled={!reason} onPress={doReport} busy={busy} />
              </View>
            </View>
          )}

          {step === 'done' && (
            <View style={styles.pad}>
              <Ionicons name="checkmark-circle" size={36} color={colors.primary} style={{ alignSelf: 'center' }} />
              <Text style={[styles.title, { textAlign: 'center' }]}>Thanks for letting us know</Text>
              <Text style={[styles.body, { textAlign: 'center' }]}>
                We’ve hidden it for you and our team will review it within 24 hours. Content that breaks our
                rules is removed and repeat offenders lose their account.
              </Text>
              <View style={styles.row}>
                <Pill label="Done" onPress={onClose} />
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.muted} />
      <Text style={[styles.optionText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

function Pill({
  label,
  danger,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[styles.pill, danger && styles.pillDanger, (disabled || busy) && { opacity: 0.5 }]}
    >
      {busy ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.pillText, danger && { color: colors.white }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  optionText: { fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  title: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  body: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginBottom: spacing.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  reasonText: { fontSize: font.body, color: colors.text, flex: 1 },
  input: {
    minHeight: 64,
    maxHeight: 120,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.small,
    color: colors.text,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pill: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  pillText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.text },
});
