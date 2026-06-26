import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { colors } from '@/theme';
import { applyGlobalFont } from '@/lib/fonts';
import { useAppStore } from '@/state/useAppStore';
import { useJournalStore } from '@/state/useJournalStore';
import { useAuthStore } from '@/state/useAuthStore';

applyGlobalFont();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const appHydrated = useAppStore((s) => s.hasHydrated);
  const journalHydrated = useJournalStore((s) => s.hasHydrated);
  const authInitialized = useAuthStore((s) => s.initialized);
  const ready = fontsLoaded && appHydrated && journalHydrated && authInitialized;

  useEffect(() => {
    useAuthStore.getState().init();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {ready ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
