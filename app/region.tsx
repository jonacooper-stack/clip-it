import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Button } from '@/components/Button';
import { CrewAvatar } from '@/components/crew/CrewAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { saveHomeRegion } from '@/lib/crew/api';
import { REGIONS, suggestRegion, type RegionKey } from '../shared/crew';

// East to west, then the rest (REGIONS itself is ordered for location lookups).
const DISPLAY_ORDER: RegionKey[] = [
  'northeast', 'mid_atlantic', 'southeast', 'midwest', 'plains', 'texas', 'rockies',
  'southwest', 'california', 'pacific_northwest', 'alaska', 'hawaii', 'canada', 'elsewhere',
];

// Home region: picked by the player (during sign-up, or from Profile). The
// location button only suggests one: coordinates never leave the phone, and
// only the region the player chooses is saved.
export default function RegionPicker() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  // Where to go after saving. Only a path inside the app: this comes from the
  // URL, and anything else (another site) is ignored.
  const next = typeof params.next === 'string' && /^\/(?!\/)[\w\-/()\[\]]*$/.test(params.next) ? params.next : undefined;
  const current = useAppStore((s) => s.homeRegion);
  const setHomeRegion = useAppStore((s) => s.setHomeRegion);
  const [choice, setChoice] = useState<RegionKey | null>(current);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);

  const useLocation = async () => {
    setLocating(true);
    setLocNote(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocNote('No problem. Just pick your region from the list.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const r = suggestRegion(pos.coords.latitude, pos.coords.longitude);
      setChoice(r);
      setLocNote(`Looks like ${REGIONS.find((x) => x.key === r)?.label}. Change it if that’s not where you usually explore.`);
    } catch {
      setLocNote('Couldn’t get your location. Pick from the list instead.');
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    if (!choice) return;
    setHomeRegion(choice);
    saveHomeRegion(choice).catch(() => {});
    if (next) router.replace(next as any);
    else if (router.canGoBack()) router.back();
    else router.replace('/feed');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!next && (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))} style={styles.back} hitSlop={8} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        )}
        <View style={styles.scout}>
          <CrewAvatar size={52} />
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>
              Hi, I’m Scout, your AI field guide! 🦊 Where do you usually explore? I’ll post what animals are up to
              near you every day.
            </Text>
          </View>
        </View>

        <Pressable onPress={useLocation} disabled={locating} style={styles.locBtn}>
          {locating ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="locate" size={18} color={colors.primary} />}
          <Text style={styles.locText}>Use my current location to suggest one</Text>
        </Pressable>
        <Text style={styles.privacy}>Your location stays on your phone. We only save the region you pick.</Text>
        {!!locNote && <Text style={styles.locNote}>{locNote}</Text>}

        <View style={styles.list}>
          {DISPLAY_ORDER.map((k) => REGIONS.find((r) => r.key === k)!).map((r) => {
            const on = choice === r.key;
            return (
              <Pressable key={r.key} onPress={() => setChoice(r.key)} style={[styles.row, on && styles.rowOn]}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.faint} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={styles.rowHint}>{r.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button label={next ? 'Continue' : 'Save'} icon="arrow-forward" onPress={save} disabled={!choice} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: spacing.sm, marginLeft: -8 },
  scout: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.md },
  bubble: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderTopLeftRadius: 4, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  bubbleText: { fontSize: font.body, color: colors.text, lineHeight: 23 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  locText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.primary },
  privacy: { fontSize: font.tiny, color: colors.faint, textAlign: 'center', marginTop: spacing.xs },
  locNote: { fontSize: font.small, color: colors.accentInk, textAlign: 'center', marginTop: spacing.sm },
  list: { marginTop: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rowOn: { borderColor: colors.primary },
  rowLabel: { fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  rowHint: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
