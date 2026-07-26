import { Tabs, Redirect, useRouter } from 'expo-router';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadow } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore } from '@/state/useAuthStore';
import { isSupabaseConfigured } from '@/lib/supabase';

// The raised "ClipIt" camera button in the center of the tab bar — the primary
// action, always one tap away.
function CaptureButton() {
  const router = useRouter();
  return (
    <View style={styles.captureSlot} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/capture/camera')}
        style={({ pressed }) => [styles.captureBtn, pressed && styles.capturePressed]}
        accessibilityLabel="ClipIt — take a photo"
      >
        <Ionicons name="camera" size={30} color={colors.white} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  const session = useAuthStore((s) => s.session);
  // When accounts are enabled, a session is required; otherwise the app is local-only.
  if (isSupabaseConfigured && !session) return <Redirect href="/onboarding/welcome" />;
  // A signed-in user who hasn't finished the intro (e.g. returning from the Google
  // redirect) just needs the ethos step; a local-only user starts at welcome.
  if (!hasOnboarded) {
    return <Redirect href={isSupabaseConfigured ? '/onboarding/ethos' : '/onboarding/welcome'} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 8,
          paddingBottom: 10,
          shadowColor: colors.pine,
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontFamily: fonts.headingMd, fontSize: 11, letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Feed', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="journal"
        options={{ title: 'Journal', tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="capture"
        options={{ title: '', tabBarButton: () => <CaptureButton /> }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Community',
          // Only a tab when accounts are on; otherwise hidden + unreachable.
          href: isSupabaseConfigured ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
      {/* Quests still exists as a route (reached from the Feed header) but isn't its own tab. */}
      <Tabs.Screen name="quests" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  captureSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  captureBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    top: -18, // lift it above the bar
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow.lifted,
  },
  capturePressed: { transform: [{ scale: 0.94 }], opacity: 0.95 },
});
