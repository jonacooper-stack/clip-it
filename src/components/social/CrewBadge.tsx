// "AI" badge shown next to Scout's name everywhere (posts, comments), so
// players always know when they're reading the AI companion, not a person.
import { Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '@/theme';

export const SCOUT_EXPLAINER =
  'Scout is ClipIt’s AI field guide, made by the ClipIt team. It isn’t a real player and never competes with you. ' +
  'Scout posts fun facts about what you find, shows what animals are up to near you, and gives you quests.\n\n' +
  'Prefer a quieter feed? Turn off “Show Scout in my feed” in Profile.';

export function explainScout() {
  if (Platform.OS === 'web') (globalThis as any).alert?.(`Scout is an AI\n\n${SCOUT_EXPLAINER}`);
  else Alert.alert('Scout is an AI', SCOUT_EXPLAINER);
}

export function CrewBadge({ small = false }: { small?: boolean }) {
  return (
    <Pressable
      onPress={explainScout}
      hitSlop={8}
      style={[styles.badge, small && styles.small]}
      accessibilityRole="button"
      accessibilityLabel="AI companion. Tap to learn about Scout."
    >
      <Ionicons name="sparkles" size={small ? 9 : 10} color={colors.dusk} />
      <Text style={[styles.text, small && styles.smallText]}>AI</Text>
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
