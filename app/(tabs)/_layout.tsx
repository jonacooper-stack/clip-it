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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.headingMd, fontSize: 11, letterSpacing: 0.3 },
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
