// "BOT" badge shown next to every Field Crew name (Dr. Hoot, Scout, Moss,
// Magpie, Kestrel). Tapping it explains who the crew are, so players always
// know when they're looking at a bot.
import { Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '@/theme';

export const CREW_EXPLAINER =
  'The Field Crew are friendly bots made by the ClipIt team, not real players: Dr. Hoot shares facts about what ' +
  'you find, Scout sends a weekly forecast for your region, Moss sets your challenges, Magpie collects the best ' +
  'sightings, and Kestrel challenges you to a weekly duel. Kestrel is the only one on the leaderboard, and it ' +
  'stops climbing just below the top real player, so you can always pass it.\n\n' +
  'Prefer a quieter wall? Turn off “Show Field Crew on the wall” in Profile.';

export function explainCrew() {
  if (Platform.OS === 'web') (globalThis as any).alert?.(`The Field Crew are bots\n\n${CREW_EXPLAINER}`);
  else Alert.alert('The Field Crew are bots', CREW_EXPLAINER);
}

export function CrewBadge({ small = false }: { small?: boolean }) {
  return (
    <Pressable
      onPress={explainCrew}
      hitSlop={8}
      style={[styles.badge, small && styles.small]}
      accessibilityRole="button"
      accessibilityLabel="Bot account. Tap to learn about the Field Crew."
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
