import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, fonts } from '@/theme';

// Shown whenever an identification came from the demo identifier (no real AI).
// Release builds on the phone never produce these (failures are queued and
// retried instead), so this appears only on the web demo and dev builds. The
// technical reason goes to the console, not the screen.
export function DemoNotice({ compact = false, reason }: { compact?: boolean; reason?: string }) {
  if (reason) console.warn('Demo identifier used:', reason);
  return (
    <View style={styles.wrap}>
      <Ionicons name="flask-outline" size={16} color={colors.dusk} style={styles.icon} />
      <Text style={styles.text}>
        <Text style={styles.bold}>Sample result.</Text>
        {compact
          ? ' We couldn’t reach the identifier, so this is a sample species, not your photo.'
          : ' We couldn’t reach the identifier, so this is a sample species. It didn’t look at your photo. Try another capture in a moment.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.duskSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
  },
  icon: { marginRight: spacing.sm, marginTop: 1 },
  text: { flex: 1, fontSize: font.small, color: colors.dusk, lineHeight: 20 },
  bold: { fontFamily: fonts.bodyBold },
});
