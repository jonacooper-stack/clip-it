import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WallFeed } from '@/components/WallFeed';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';

// The app's home is the community Feed — the wall front-and-center. Capturing a
// new sighting is the raised camera button in the middle of the tab bar.
export default function Feed() {
  const router = useRouter();
  const streak = useAppStore((s) => s.streakCount);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.brand}>
          Clip<Text style={styles.brandAccent}>It</Text>
        </Text>
        <View style={styles.headerRight}>
          {streak > 0 && (
            <View style={styles.streak}>
              <Ionicons name="flame" size={14} color={colors.accent} />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
          )}
          <Pressable onPress={() => router.push('/quests')} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="trophy-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <WallFeed />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  brand: { fontSize: font.title, fontFamily: fonts.display, color: colors.text, letterSpacing: 0.3 },
  brandAccent: { color: colors.primary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  streakText: { fontSize: font.small, fontFamily: fonts.display, color: colors.accentInk },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
