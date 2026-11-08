// "BOT" badge shown next to every ClipIt Ranger's name (labeled bot accounts
// run by the ClipIt team). Tapping it explains what Rangers are, so players
// always know when they're looking at a bot.
import { Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '@/theme';

export const RANGERS_EXPLAINER =
  'ClipIt Rangers are bot accounts run by the ClipIt team, not real players. They post real wildlife photos ' +
  '(credited to the photographers) and set the pace on the leaderboard so there’s always someone to chase. ' +
  'Rangers stop gaining points when they get close to the top real player, so a strong player can always pass them.\n\n' +
  'Don’t want to see them? Turn off “Show ClipIt Rangers” in Profile.';

export function explainRangers() {
  if (Platform.OS === 'web') (globalThis as any).alert?.(`ClipIt Rangers are bots\n\n${RANGERS_EXPLAINER}`);
  else Alert.alert('ClipIt Rangers are bots', RANGERS_EXPLAINER);
}

export function RangerBadge({ small = false }: { small?: boolean }) {
  return (
    <Pressable
      onPress={explainRangers}
      hitSlop={8}
      style={[styles.badge, small && styles.small]}
      accessibilityRole="button"
      accessibilityLabel="Bot account. Tap to learn about ClipIt Rangers."
    >
      <Ionicons name="hardware-chip-outline" size={small ? 10 : 11} color={colors.dusk} />
      <Text style={[styles.text, small && styles.smallText]}>BOT</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.duskSoft,
    borderWidth: 1,
    borderColor: 'rgba(124,169,198,0.35)',
  },
  small: { paddingHorizontal: 5, paddingVertical: 1 },
  text: { fontSize: 10, fontFamily: fonts.bodyBold, color: colors.dusk, letterSpacing: 0.6 },
  smallText: { fontSize: 9 },
});
