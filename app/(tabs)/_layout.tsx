import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '@/theme';
import { useAppStore } from '@/state/useAppStore';

export default function TabsLayout() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  if (!hasOnboarded) return <Redirect href="/onboarding/welcome" />;

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
        options={{ title: 'Spot', tabBarIcon: ({ color, size }) => <Ionicons name="camera" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="journal"
        options={{ title: 'Journal', tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="quests"
        options={{ title: 'Quests', tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
