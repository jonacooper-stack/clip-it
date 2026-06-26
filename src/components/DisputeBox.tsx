import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Button } from './Button';
import { colors, spacing, font, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import type { Sighting } from '@/types';

// The "self-ID as a check" path: AI leads, but if you disagree you submit your
// own guess, which marks the sighting disputed and routes it to human review.
export function DisputeBox({ sighting }: { sighting: Sighting }) {
  const update = useJournalStore((s) => s.updateSighting);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  if (sighting.idStatus === 'disputed') {
    return (
      <Card style={styles.done}>
        <View style={styles.doneHead}>
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          <Text style={styles.doneTitle}>Sent for review</Text>
        </View>
        <Text style={styles.doneText}>
          Thanks — a human reviewer will take a look
          {sighting.proposedSpecies ? `. You suggested: ${sighting.proposedSpecies}` : ''}.
        </Text>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button label="Not right? Suggest an ID" variant="ghost" icon="flag" onPress={() => setOpen(true)} />
    );
  }

  const submit = () => {
    update(sighting.id, { idStatus: 'disputed', proposedSpecies: text.trim() || undefined });
  };

  return (
    <Card>
      <Text style={styles.label}>What do you think it is?</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="e.g. Coyote — or describe what you saw"
        placeholderTextColor={colors.faint}
        style={styles.input}
        autoFocus
      />
      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} style={styles.action} />
        <Button label="Send to review" onPress={submit} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  done: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  doneTitle: { fontSize: font.body, fontWeight: '800', color: colors.onPrimary },
  doneText: { fontSize: font.small, color: colors.onPrimary, lineHeight: 20 },
  label: { fontSize: font.small, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: font.body,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: { flex: 1 },
});
