import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  PanResponder,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';
import { setPendingPhoto } from '@/state/pendingCaptures';
import { pickImageWithMetadata } from '@/lib/importPhoto';
import { processAnalysisQueue } from '@/lib/analysis';
import { resizedBase64 } from '@/lib/prepareImage';
import { savePhoto } from '@/lib/photoStore';
import { newId } from '@/lib/id';

// Rapid-fire capture is native-only — it relies on the on-device analysis queue.
const RAPID_FIRE_AVAILABLE = Platform.OS !== 'web';

// expo-camera's `zoom` is a normalized 0..1 value, not a true magnification. We
// show it as 1.0×..MAX× purely as a readout; pinch and the +/- buttons move the
// normalized value.
const MAX_ZOOM_X = 8;
const ZOOM_STEP = 0.04;
// How much a pinch moves the normalized zoom. expo-camera's iOS zoom curve is very
// sensitive at the low end, so keep this gentle to avoid the "zooms in too fast" feel.
const PINCH_SENSITIVITY = 0.15;

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
  // `?rapid=1` opens straight into rapid-fire (used by "switch to rapid fire").
  const params = useLocalSearchParams<{ rapid?: string }>();
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
  const [rapidFire, setRapidFire] = useState(params.rapid === '1');
  const [burstCount, setBurstCount] = useState(0);
  const flashAnim = useRef(new Animated.Value(0)).current;
  // One GPS fix for the whole burst, so rapid shots get a location without each
  // one waiting on the locator.
  const burstLoc = useRef<{ lat: number; lng: number } | null>(null);

  // Quick white flash to confirm each rapid-fire shot landed.
  const flashShutter = () => {
    flashAnim.setValue(0.55);
    Animated.timing(flashAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };

  // Warm up a location fix whenever rapid fire turns on (via the toggle or the
  // ?rapid=1 deep link), so burst shots aren't stamped "Not recorded".
  useEffect(() => {
    if (!rapidFire) {
      burstLoc.current = null;
      return;
    }
    let active = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const granted = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
        if (!granted) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) burstLoc.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        // location is best-effort
      }
    })();
    return () => {
      active = false;
    };
  }, [rapidFire]);

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
          applyZoom(pinch.current.zoom + (ratio - 1) * PINCH_SENSITIVITY);
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
        // Only pull base64 straight from the camera on web; on native we downscale
        // from the file so the AI payload stays under the request-size limit.
        photo = await camRef.current.takePictureAsync({
          base64: Platform.OS === 'web',
          quality: 0.6,
        });
      } catch {
        // Some browsers can't capture; continue without a photo so the demo loop still completes.
        photo = undefined;
      }

      // Keep a copy in the player's camera roll (opt-out in Settings). Best-effort.
      if (photo?.uri && saveToCameraRoll) await saveCaptureToCameraRoll(photo.uri);

      // Shrink for the AI (native), or use the browser's base64 (web).
      const b64 =
        Platform.OS === 'web'
          ? photo?.base64
          : photo?.uri
            ? await resizedBase64(photo.uri)
            : undefined;

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
      if (b64) setPendingPhoto(id, b64);
      const photoRef = photo?.uri ? await savePhoto(photo.uri) : undefined;
      addSighting({
        id,
        createdAt: now,
        observedAt: now,
        photoUri: photoRef,
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

  // Capture with the native iOS camera (better focus + smoother zoom than the
  // in-app preview). Opens the system camera, then runs the returned photo through
  // the normal identify flow.
  const captureViaSystemCamera = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, exif: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];

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
        // location is best-effort
      }

      if (saveToCameraRoll) await saveCaptureToCameraRoll(a.uri);

      const id = newId();
      const now = Date.now();
      const b64 = await resizedBase64(a.uri);
      if (b64) setPendingPhoto(id, b64);
      const photoRef = await savePhoto(a.uri);
      addSighting({
        id,
        createdAt: now,
        observedAt: now,
        photoUri: photoRef,
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

  // Rapid fire: snap and queue instantly — no waiting on the AI. The on-device
  // queue identifies and scores the burst later (when finished / back online).
  const captureRapid = async () => {
    if (busy || !camRef.current) return;
    setBusy(true);
    try {
      let photo: { uri?: string } | undefined;
      try {
        photo = await camRef.current.takePictureAsync({ quality: 0.6 });
      } catch {
        photo = undefined;
      }
      if (!photo?.uri) return;

      // Use the burst's warmed-up fix; fall back to the last known position. Never
      // block a burst waiting on a fresh locate.
      let lat: number | undefined = burstLoc.current?.lat;
      let lng: number | undefined = burstLoc.current?.lng;
      if (lat == null) {
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.granted) {
            const pos = await Location.getLastKnownPositionAsync();
            if (pos) {
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
            }
          }
        } catch {
          // location is best-effort
        }
      }

      const id = newId();
      const now = Date.now();
      const stored = await savePhoto(photo.uri);
      addSighting({
        id,
        createdAt: now,
        observedAt: now,
        photoUri: stored ?? photo.uri,
        lat,
        lng,
        sceneTags: [],
        idStatus: 'queued',
      });
      // Copy to the camera roll only if already permitted — never prompt mid-burst.
      if (saveToCameraRoll) {
        const savedUri = photo.uri;
        MediaLibrary.getPermissionsAsync(true)
          .then((p) => {
            if (p.granted) return MediaLibrary.saveToLibraryAsync(savedUri);
          })
          .catch(() => {});
      }
      setBurstCount((n) => n + 1);
      flashShutter();
    } finally {
      setBusy(false);
    }
  };

  const toggleRapidFire = () => {
    setRapidFire((on) => {
      if (!on) setBurstCount(0); // starting a fresh burst
      return !on;
    });
  };

  // Finish a burst: start identifying the queued shots and go watch them resolve.
  const finishBurst = () => {
    processAnalysisQueue();
    router.replace('/');
  };

  // Leaving the camera: if a burst is pending, start analyzing it on the way out.
  const onClose = () => {
    if (burstCount > 0) processAnalysisQueue();
    router.back();
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
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.captureFlash, { opacity: flashAnim }]}
      />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8}>
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
          {RAPID_FIRE_AVAILABLE && (
            <View style={styles.modeRow} pointerEvents="box-none">
              <Pressable
                onPress={toggleRapidFire}
                style={[styles.rapidPill, rapidFire && styles.rapidPillOn]}
                hitSlop={6}
              >
                <Ionicons name="flash" size={15} color={rapidFire ? colors.accentInk : colors.white} />
                <Text style={[styles.rapidPillText, rapidFire && styles.rapidPillTextOn]}>
                  {rapidFire ? `Rapid fire · ${burstCount}` : 'Rapid fire'}
                </Text>
              </Pressable>
              {!rapidFire && (
                <Pressable
                  onPress={captureViaSystemCamera}
                  disabled={busy}
                  style={styles.rapidPill}
                  hitSlop={6}
                >
                  <Ionicons name="camera-outline" size={15} color={colors.white} />
                  <Text style={styles.rapidPillText}>System camera</Text>
                </Pressable>
              )}
            </View>
          )}

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
            <Pressable
              onPress={rapidFire ? captureRapid : capture}
              disabled={busy}
              style={styles.shutterOuter}
            >
              {busy && !rapidFire ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={[styles.shutterInner, rapidFire && styles.shutterInnerRapid]} />
              )}
            </Pressable>
            <Pressable onPress={toggleFacing} style={[styles.sideSlot, styles.flipBtn]} hitSlop={8}>
              <Ionicons name="camera-reverse" size={28} color={colors.white} />
            </Pressable>
          </View>
          {rapidFire && burstCount > 0 ? (
            <Pressable onPress={finishBurst} style={styles.doneBurstBtn}>
              <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
              <Text style={styles.doneBurstText}>
                Review {burstCount} shot{burstCount > 1 ? 's' : ''}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>
              {rapidFire
                ? 'Tap to capture — we’ll identify them all later'
                : 'Pinch to zoom · tap to capture · or upload from your roll'}
            </Text>
          )}
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
  captureFlash: { backgroundColor: '#fff' },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rapidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  rapidPillOn: { backgroundColor: colors.accentSoft },
  rapidPillText: { color: colors.white, fontSize: font.small, fontFamily: fonts.bodyBold, letterSpacing: 0.3 },
  rapidPillTextOn: { color: colors.accentInk },
  shutterInnerRapid: { backgroundColor: colors.accent },
  doneBurstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  doneBurstText: { color: colors.onPrimary, fontSize: font.body, fontFamily: fonts.bodyBold },

  permSafe: { flex: 1, backgroundColor: colors.bg },
  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  permEmoji: { fontSize: 56, marginBottom: spacing.md },
  permTitle: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  permText: { fontSize: font.body, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  permBack: { marginTop: spacing.sm },
});
