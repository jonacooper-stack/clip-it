import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, fonts } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { identifySighting, OfflineError } from '@/lib/identify';
import { applyIdentifyOutcome, persistQueuedPhoto, processAnalysisQueue } from '@/lib/analysis';
import { takePendingPhoto } from '@/state/pendingCaptures';

export default function Identifying() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const updateSighting = useJournalStore((s) => s.updateSighting);
  const removeSighting = useJournalStore((s) => s.removeSighting);
  const sighting = useJournalStore((s) => s.sightings.find((x) => x.id === id));
  const ran = useRef(false);
  const cancelled = useRef(false);

  // Bail out of an in-flight identification: drop the draft and go home. The
  // async guards on `cancelled` so a late result can't navigate us back.
  const cancel = () => {
    cancelled.current = true;
    if (id) removeSighting(id);
    router.replace('/');
  };

  useEffect(() => {
    if (ran.current || !id) return;
    ran.current = true;

    (async () => {
      const current = useJournalStore.getState().sightings.find((x) => x.id === id);
      const base64 = takePendingPhoto(id);

      try {
        const outcome = await identifySighting({
          photoBase64: base64,
          lat: current?.lat,
          lng: current?.lng,
          accuracyM: current?.accuracyM,
          observedAt: current?.observedAt ?? Date.now(),
        });
        if (cancelled.current) return;
        applyIdentifyOutcome(id, outcome);
        router.replace(`/capture/result?id=${id}`);
        // We just reached the AI, so flush anything that was queued while offline.
        processAnalysisQueue();
      } catch (err) {
        if (cancelled.current) return;
        if (err instanceof OfflineError) {
          // No signal: keep the photo (and its time/place) and queue it for later.
          const uri = base64 ? await persistQueuedPhoto(id, base64) : undefined;
          if (cancelled.current) return;
          updateSighting(id, { idStatus: 'queued', photoUri: uri ?? current?.photoUri });
        } else {
          updateSighting(id, { idStatus: 'rejected' });
        }
        router.replace(`/capture/result?id=${id}`);
      }
    })();
  }, [id]);

  return (
    <View style={styles.container}>
      {sighting?.photoUri ? (
        <Image source={{ uri: sighting.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={styles.scrim} />
      <SafeAreaView style={styles.topSafe} edges={['top']} pointerEvents="box-none">
        <Pressable onPress={cancel} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={28} color={colors.white} />
        </Pressable>
      </SafeAreaView>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={styles.title}>Identifying…</Text>
        <Text style={styles.sub}>Checking the species and scoring your find</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,22,16,0.62)' },
  topSafe: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.sm },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.white, fontSize: font.title, fontFamily: fonts.heading, marginTop: spacing.lg, letterSpacing: 0.5 },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: font.body, marginTop: spacing.sm, textAlign: 'center' },
});
