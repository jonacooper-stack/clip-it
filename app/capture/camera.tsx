import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';
import { setPendingPhoto } from '@/state/pendingCaptures';
import { pickImageWithMetadata } from '@/lib/importPhoto';
import { newId } from '@/lib/id';

// expo-camera's `zoom` is a normalized 0..1 value, not a true magnification. We
// show it as 1.0×..MAX× purely as a readout; pinch and the +/- buttons move the
// normalized value.
const MAX_ZOOM_X = 8;
const ZOOM_STEP = 0.1;

// On web, stop the browser from claiming the two-finger pinch as a page zoom so
// the gesture reaches our handler (where the browser exposes camera zoom at all).
const webTouchReset: any = Platform.OS === 'web' ? { touchAction: 'none' } : null;

function fingerDistance(touches: ReadonlyArray<{ pageX: number; pageY: number }>): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy) || 1;
}

// Best-effort copy of a freshly captured photo into the device camera roll, so a
// player keeps their own shot without screenshotting. Uses a write-only Photos
// permission (we only add, never read the library). Native-only and never throws:
// saving a copy is a nicety and must never break the capture loop.
async function saveCaptureToCameraRoll(uri: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    let granted = (await MediaLibrary.getPermissionsAsync(true)).granted;
    if (!granted) granted = (await MediaLibrary.requestPermissionsAsync(true)).granted;
    if (granted) await MediaLibrary.saveToLibraryAsync(uri);
  } catch {
    // ignore — keeping a camera-roll copy is optional
  }
}

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const addSighting = useJournalStore((s) => s.addSighting);
  const saveToCameraRoll = useAppStore((s) => s.saveToCameraRoll);

  const applyZoom = (z: number) => {
    const clamped = Math.min(Math.max(z, 0), 1);
    zoomRef.current = clamped;
    setZoom(clamped);
  };

  // Two-finger pinch to zoom. Claims the gesture only when exactly two fingers are
  // down, so single-finger taps still reach the shutter and the other buttons.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches;
        if (t.length === 2) pinch.current = { dist: fingerDistance(t), zoom: zoomRef.current };
      },
      onPanResponderMove: (e) => {
        const t = e.nativeEvent.touches;
        if (t.length === 2 && pinch.current) {
          const ratio = fingerDistance(t) / pinch.current.dist;
          applyZoom(pinch.current.zoom + (ratio - 1) * 0.5);
        }
      },
      onPanResponderRelease: () => {
        pinch.current = null;
      },
      onPanResponderTerminate: () => {
        pinch.current = null;
      },
    }),
  ).current;

  // Web fallback: if the browser can't give us a camera, still let the loop run.
  const proceedWithoutCamera = () => {
    const id = newId();
    const now = Date.now();
    addSighting({ id, createdAt: now, observedAt: now, sceneTags: [], idStatus: 'identifying' });
    router.replace(`/capture/identifying?id=${id}`);
  };

  // Upload an existing photo from the camera roll, carrying its real date and
  // location from the photo's metadata. Works without camera permission.
  const importFromLibrary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickImageWithMetadata();
      if (!picked) return;
      const id = newId();
      const now = Date.now();
      if (picked.base64) setPendingPhoto(id, picked.base64);
      addSighting({
        id,
        createdAt: now,
        observedAt: picked.observedAt,
        photoUri: picked.uri,
        lat: picked.lat,
        lng: picked.lng,
        sceneTags: [],
        idStatus: 'identifying',
      });
      router.replace(`/capture/identifying?id=${id}`);
    } finally {
      setBusy(false);
    }
  };

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
          <Ionicons name="camera-outline" size={48} color={colors.faint} style={styles.permEmoji} />
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Text style={styles.permText}>
            ClipIt captures the animals you spot in-app, so every sighting is genuinely yours.
          </Text>
          <Button label="Enable camera" onPress={requestPermission} />
          <Button
            label="Upload from camera roll"
            variant="secondary"
            icon="images"
            onPress={importFromLibrary}
            style={styles.permBack}
          />
          {Platform.OS === 'web' && (
            <Button
              label="Continue without camera"
              variant="secondary"
              onPress={proceedWithoutCamera}
              style={styles.permBack}
            />
          )}
          <Button label="Go back" variant="ghost" onPress={() => router.back()} style={styles.permBack} />
        </View>
      </SafeAreaView>
    );
  }

  const capture = async () => {
    if (busy || !camRef.current) return;
    setBusy(true);
    try {
      let photo: { uri?: string; base64?: string } | undefined;
      try {
        photo = await camRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      } catch {
        // Some browsers can't capture; continue without a photo so the demo loop still completes.
        photo = undefined;
      }

      // Keep a copy in the player's camera roll (opt-out in Settings). Best-effort.
      if (photo?.uri && saveToCameraRoll) await saveCaptureToCameraRoll(photo.uri);

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

  const toggleFacing = () => setFacing((f) => (f === 'back' ? 'front' : 'back'));
  const cycleFlash = () => setFlash((f) => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'));
  const flashIcon = flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off';
  const zoomLabel = `${(1 + zoom * (MAX_ZOOM_X - 1)).toFixed(1)}×`;

  return (
    <View style={[styles.container, webTouchReset]} {...panResponder.panHandlers}>
      <CameraView
        ref={camRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        zoom={zoom}
        flash={flash}
        autofocus="on"
      />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
          <View style={styles.reminder}>
            <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
            <Text style={styles.reminderText}>Keep your distance</Text>
          </View>
          <Pressable onPress={cycleFlash} style={styles.iconBtn} hitSlop={8}>
            <Ionicons
              name={flashIcon}
              size={24}
              color={flash === 'off' ? colors.white : colors.accent}
            />
          </Pressable>
        </View>

        <View style={styles.bottomBar} pointerEvents="box-none">
          <View style={styles.zoomRow} pointerEvents="box-none">
            <Pressable onPress={() => applyZoom(zoomRef.current - ZOOM_STEP)} style={styles.zoomBtn} hitSlop={6}>
              <Ionicons name="remove" size={20} color={colors.white} />
            </Pressable>
            <Pressable onPress={() => applyZoom(0)} style={styles.zoomPill} hitSlop={6}>
              <Text style={styles.zoomText}>{zoomLabel}</Text>
            </Pressable>
            <Pressable onPress={() => applyZoom(zoomRef.current + ZOOM_STEP)} style={styles.zoomBtn} hitSlop={6}>
              <Ionicons name="add" size={20} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.shutterRow} pointerEvents="box-none">
            <Pressable
              onPress={importFromLibrary}
              disabled={busy}
              style={[styles.sideSlot, styles.flipBtn]}
              hitSlop={8}
            >
              <Ionicons name="images" size={26} color={colors.white} />
            </Pressable>
            <Pressable onPress={capture} disabled={busy} style={styles.shutterOuter}>
              {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
            </Pressable>
            <Pressable onPress={toggleFacing} style={[styles.sideSlot, styles.flipBtn]} hitSlop={8}>
              <Ionicons name="camera-reverse" size={28} color={colors.white} />
            </Pressable>
          </View>
          <Text style={styles.hint}>Pinch to zoom · tap to capture · or upload from your roll</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  reminderText: { color: colors.white, fontSize: font.small, fontFamily: fonts.bodyMedium },

  bottomBar: { alignItems: 'center', paddingBottom: spacing.lg },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  zoomBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  zoomPill: {
    minWidth: 64,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  zoomText: { color: colors.white, fontSize: font.body, fontFamily: fonts.bodyBold },

  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.xxl,
  },
  sideSlot: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  flipBtn: { borderRadius: 28, backgroundColor: colors.overlay },
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
  hint: { color: colors.white, fontSize: font.small, marginTop: spacing.md, fontFamily: fonts.bodyMedium },

  permSafe: { flex: 1, backgroundColor: colors.bg },
  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  permEmoji: { fontSize: 56, marginBottom: spacing.md },
  permTitle: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  permText: { fontSize: font.body, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  permBack: { marginTop: spacing.sm },
});
