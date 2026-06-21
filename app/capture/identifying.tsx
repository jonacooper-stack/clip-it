import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors, spacing, font } from '@/theme';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';
import { identifySighting } from '@/lib/identify';
import { scoreSighting } from '@/lib/scoring';
import { takePendingPhoto } from '@/state/pendingCaptures';

export default function Identifying() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const updateSighting = useJournalStore((s) => s.updateSighting);
  const registerActivity = useAppStore((s) => s.registerActivityToday);
  const sighting = useJournalStore((s) => s.sightings.find((x) => x.id === id));
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !id) return;
    ran.current = true;

    (async () => {
      const snapshot = useJournalStore.getState().sightings;
      const current = snapshot.find((x) => x.id === id);

      const outcome = await identifySighting({
        photoBase64: takePendingPhoto(id),
        lat: current?.lat,
        lng: current?.lng,
        accuracyM: current?.accuracyM,
        observedAt: current?.observedAt ?? Date.now(),
      });

      if (!outcome.animalPresent) {
        updateSighting(id, { idStatus: 'rejected' });
        router.replace(`/capture/result?id=${id}`);
        return;
      }

      // The server returns points directly; the offline mock returns rarity so we
      // score it here (applying the first-of-species bonus from the journal).
      let points = outcome.points;
      let score = outcome.score;
      if (points == null && outcome.species && outcome.rarityScore != null) {
        const known = new Set(
          distinctSpecies(snapshot.filter((s) => s.id !== id)).map((s) => s.species!.scientificName),
        );
        const firstOfSpecies = !known.has(outcome.species.scientificName);
        score = scoreSighting({
          rarityScore: outcome.rarityScore,
          sceneTags: outcome.sceneTags,
          firstOfSpecies,
        });
        points = score.totalPoints;
      }

      updateSighting(id, {
        species: outcome.species,
        sceneTags: outcome.sceneTags,
        caption: outcome.caption,
        idStatus: outcome.idStatus,
        dangerous: outcome.dangerous,
        points,
        score,
      });
      registerActivity();
      router.replace(`/capture/result?id=${id}`);
    })();
  }, [id]);

  return (
    <View style={styles.container}>
      {sighting?.photoUri ? (
        <Image source={{ uri: sighting.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={styles.scrim} />
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
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,18,12,0.6)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.white, fontSize: font.title, fontWeight: '800', marginTop: spacing.lg },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: font.body, marginTop: spacing.sm, textAlign: 'center' },
});
