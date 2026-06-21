import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, spacing, font, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { setPendingPhoto } from '@/state/pendingCaptures';
import { newId } from '@/lib/id';

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const addSighting = useJournalStore((s) => s.addSighting);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permSafe}>
        <View style={styles.permBox}>
          <Text style={styles.permEmoji}>📷</Text>
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Text style={styles.permText}>
            Clip-It captures the animals you spot in-app, so every sighting is genuinely yours.
          </Text>
          <Button label="Enable camera" onPress={requestPermission} />
          <Button label="Go back" variant="ghost" onPress={() => router.back()} style={styles.permBack} />
        </View>
      </SafeAreaView>
    );
  }

  const capture = async () => {
    if (busy || !camRef.current) return;
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({ base64: true, quality: 0.5 });

      let lat: number | undefined;
      let lng: number | undefined;
      let accuracyM: number | undefined;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        let granted = perm.granted;
        if (!granted) granted = (await Location.requestForegroundPermissionsAsync()).granted;
        if (granted) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracyM = pos.coords.accuracy ?? undefined;
        }
      } catch {
        // Location is best-effort; the sighting still works without it.
      }

      const id = newId();
      const now = Date.now();
      if (photo?.base64) setPendingPhoto(id, photo.base64);
      addSighting({
        id,
        createdAt: now,
        observedAt: now,
        photoUri: photo?.uri,
        lat,
        lng,
        accuracyM,
        sceneTags: [],
        idStatus: 'identifying',
      });
      router.replace(`/capture/identifying?id=${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
          <View style={styles.reminder}>
            <Text style={styles.reminderText}>🛡️ Keep your distance — use zoom</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.bottomBar}>
          <Pressable onPress={capture} disabled={busy} style={styles.shutterOuter}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <Text style={styles.hint}>Frame the animal and tap to capture</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  reminder: { backgroundColor: colors.overlay, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  reminderText: { color: colors.white, fontSize: font.small, fontWeight: '700' },
  bottomBar: { alignItems: 'center', paddingBottom: spacing.lg },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
  hint: { color: colors.white, fontSize: font.small, marginTop: spacing.md, fontWeight: '600' },
  permSafe: { flex: 1, backgroundColor: colors.bg },
  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  permEmoji: { fontSize: 56, marginBottom: spacing.md },
  permTitle: { fontSize: font.title, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  permText: { fontSize: font.body, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  permBack: { marginTop: spacing.sm },
});
