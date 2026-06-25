import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, fonts } from '@/theme';

// Shown whenever an identification came from the offline demo identifier (no real
// AI). The demo can't see the photo, so it returns a random sample species. When a
// `reason` is given, the app actually tried the AI endpoint and it failed — surface
// that so the user can fix it (most often: add the key and redeploy).
export function DemoNotice({ compact = false, reason }: { compact?: boolean; reason?: string }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="flask-outline" size={16} color={colors.dusk} style={styles.icon} />
      <Text style={styles.text}>
        <Text style={styles.bold}>Demo guess.</Text>
        {reason ? (
          <>
            {' Real AI didn’t run — '}
            <Text style={styles.bold}>{reason}</Text>
            {'. If you just added the API key in Vercel, redeploy so it takes effect.'}
          </>
        ) : compact ? (
          ' Real AI is off — this is a random sample, not a look at your photo.'
        ) : (
          ' Real AI identification is off, so this is a random sample — it does not actually look at your photo or check whether there’s an animal. Add an Anthropic API key to turn on real detection.'
        )}
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
