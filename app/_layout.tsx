import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, AppState, useWindowDimensions } from 'react-native';
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
import { processAnalysisQueue } from '@/lib/analysis';
import { useJournalLoader } from '@/lib/useJournalLoader';
import { scheduleJournalSync } from '@/lib/journalSync';
import { APP_MAX_WIDTH, isWideWeb } from '@/lib/layout';

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
  // Desktop browsers: keep the app in a centered phone-width column.
  const wide = isWideWeb(useWindowDimensions().width);

  useEffect(() => {
    useAuthStore.getState().init();
    // Retry offline-queued captures, and catch up with the cloud journal,
    // whenever the app returns to the foreground.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        processAnalysisQueue();
        scheduleJournalSync();
      }
    });
    // Also poll periodically so the queue drains when the signal returns while the
    // app stays open (AppState won't fire then). No-ops when nothing's queued.
    const iv = setInterval(() => processAnalysisQueue(), 20000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, []);

  // The signed-in account's journal is loaded here (and again whenever the
  // account changes). Each load also rescues interrupted captures, sends
  // anything queued for identification, and syncs with the cloud.
  useJournalLoader();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={[styles.outer, wide && styles.outerWide]}>
        <View style={[styles.column, wide && styles.columnWide]}>
          {ready ? (
            <Stack
              // Per-screen options are decided here, by route name, so they
              // are known before a screen opens. The native stack reads how a
              // screen is presented when it is pushed; changing that from
              // inside an already-open screen (as the story reader used to do
              // with `presentation`) leaves a blank black screen on iOS.
              // (A function rather than <Stack.Screen> children: in this
              // expo-router version, listing a screen as a child drops its
              // default getId and leaks an internal key into the web URL.)
              screenOptions={({ route }) => {
                const story = route.name === 'story'; // Scout's story reader fades in over the feed
                return {
                  headerShown: false,
                  contentStyle: { backgroundColor: story ? '#000' : colors.bg },
                  animation: story ? 'fade' : 'slide_from_right',
                };
              }}
            />
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.bg },
  outerWide: { backgroundColor: '#070B08', alignItems: 'center' },
  column: { flex: 1, width: '100%' },
  columnWide: {
    maxWidth: APP_MAX_WIDTH,
    backgroundColor: colors.bg,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
