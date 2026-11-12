import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CrewAvatar } from '@/components/crew/CrewAvatar';
import { CrewBadge } from '@/components/social/CrewBadge';
import { askReportPhoto } from '@/components/crew/reportPhoto';
import { loadStory, storyCover, type StoryRef } from '@/lib/crew/api';
import { useCrewStore, type Story, type StoryPage } from '@/state/useCrewStore';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { withArticle } from '../shared/crew';

// Scout's story behind a post, one page at a time (like Instagram stories):
// tap the right side for the next page, the left side to go back.
//
// How this screen is presented (a fade over the feed) is set in
// app/_layout.tsx, not here: see the note there.

const TONES = ['#25506C', '#1E5E3A', '#7A3F24', '#7E6114', '#A9501A'];
const FADE = Array.from({ length: 14 }, (_, i) => 0.82 * Math.pow((i + 1) / 14, 1.5));

// What Scout says while a story is being written (a new line every few seconds,
// so a long wait never looks stuck).
const WAITING = [
  'Scout is getting your story ready…',
  'Flipping through my field notes…',
  'Picking the best photos…',
  'New stories take a little longer. Almost there…',
];

export default function StoryScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{ kind?: string; species?: string; sci?: string; title?: string; region?: string; weekOf?: string }>();
  const ref = useMemo<StoryRef | null>(
    () =>
      p.species
        ? {
            kind: p.kind === 'theme' ? 'theme' : 'species',
            species: String(p.species),
            sci: p.sci || undefined,
            title: p.title || undefined,
            region: p.region || undefined,
            weekOf: p.weekOf || undefined,
          }
        : null,
    [p.kind, p.species, p.sci, p.title, p.region, p.weekOf],
  );
  const [story, setStory] = useState<Story | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(0);
  const [waited, setWaited] = useState(0); // which WAITING line to show
  const hidden = useCrewStore((s) => s.hiddenPhotos);
  // The slide the player tapped (shown while the story loads).
  const cover = useMemo(() => (ref ? storyCover(ref) : null), [ref]);
  const coverPhoto = cover?.photo && !hidden.includes(cover.photo.uri) ? cover.photo : null;

  const load = useCallback(() => {
    if (!ref) return setState('error');
    let on = true;
    setState('loading');
    setWaited(0);
    loadStory(ref)
      .then((s) => {
        if (!on) return;
        setStory(s);
        setPage(0);
        setState(s?.pages?.length ? 'ready' : 'error');
        // Warm the other pages' photos so turning a page never flashes empty.
        const urls = (s?.pages ?? []).map((pg) => pg.photo?.url).filter((u): u is string => Boolean(u));
        if (urls.length) Image.prefetch(urls).catch(() => {});
      })
      .catch(() => on && setState('error'));
    return () => {
      on = false;
    };
  }, [ref]);
  useEffect(load, [load]);

  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setInterval(() => setWaited((n) => Math.min(n + 1, WAITING.length - 1)), 4000);
    return () => clearInterval(timer);
  }, [state]);

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/feed')), [router]);
  const pages = story?.pages ?? [];
  const total = pages.length + 1; // + the closing page
  const next = useCallback(() => (page < total - 1 ? setPage(page + 1) : close()), [page, total, close]);
  const prev = useCallback(() => setPage((n) => Math.max(0, n - 1)), []);

  // Arrow keys on the web.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (state !== 'ready') return;
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    (globalThis as any).addEventListener?.('keydown', onKey);
    return () => (globalThis as any).removeEventListener?.('keydown', onKey);
  }, [state, next, prev, close]);

  // Each page's words fade in as it turns.
  const appear = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state !== 'ready') return;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [page, state, appear]);

  const current: StoryPage | undefined = pages[page];
  const photo = current?.photo && !hidden.includes(current.photo.url) ? current.photo : null;
  const ready = state === 'ready';
  // Photo and credit for whatever is on screen: the story page, or (until the
  // story arrives) the slide the player tapped.
  const backdrop = ready ? (photo ? { uri: photo.url, credit: photo.credit, source: photo.source } : null) : coverPhoto;
  const tone = ready ? (current ? TONES[page % TONES.length] : '#1E5E3A') : '#1E3A2B';
  const title = story?.title ?? p.title ?? p.species ?? 'Story';

  return (
    <View style={[styles.screen, { backgroundColor: tone }]}>
      {backdrop && (
        <>
          <Image source={{ uri: backdrop.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          {ready ? (
            <View style={styles.fade} pointerEvents="none">
              {FADE.map((a, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${a.toFixed(3)})` }} />
              ))}
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />
          )}
        </>
      )}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* progress + header */}
        <View style={styles.top}>
          {ready && (
            <View style={styles.bars}>
              {Array.from({ length: total }, (_, i) => (
                <View key={i} style={styles.bar}>
                  <View style={[styles.barFill, { width: i <= page ? '100%' : '0%' }]} />
                </View>
              ))}
            </View>
          )}
          <View style={styles.header}>
            <CrewAvatar size={32} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>Scout</Text>
                <CrewBadge small />
              </View>
              <Text style={styles.storyTitle} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close story">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          {backdrop?.credit ? (
            <View style={styles.creditRow}>
              <Pressable disabled={!backdrop.source} onPress={() => backdrop.source && Linking.openURL(backdrop.source).catch(() => {})} style={{ flexShrink: 1 }}>
                <Text style={styles.credit} numberOfLines={1}>
                  📷 {backdrop.credit}
                </Text>
              </Pressable>
              {ready && (
                <Pressable
                  onPress={() => askReportPhoto(backdrop.uri, { species: story?.species, context: story?.title })}
                  style={styles.flag}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Report this photo"
                >
                  <Ionicons name="flag-outline" size={12} color="#fff" />
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        {state === 'loading' && (
          <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="Loading the story">
            <Text style={styles.loadingEmoji}>{cover?.emoji || '📖'}</Text>
            <Text style={styles.loadingTitle} numberOfLines={3}>
              {title}
            </Text>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>{WAITING[waited]}</Text>
          </View>
        )}
        {state === 'error' && (
          <View style={styles.center}>
            <Text style={styles.loadingEmoji}>🦊</Text>
            <Text style={styles.loadingTitle}>This story isn’t ready yet</Text>
            <Text style={styles.loadingText}>Scout couldn’t fetch it just now. Check your connection and try again.</Text>
            <View style={styles.endBtns}>
              <Pressable onPress={load} style={styles.btn} accessibilityRole="button">
                <Ionicons name="refresh" size={16} color="#1a0d03" />
                <Text style={styles.btnText}>Try again</Text>
              </Pressable>
              <Pressable onPress={close} style={[styles.btn, styles.btnGhost]} accessibilityRole="button">
                <Text style={[styles.btnText, { color: '#fff' }]}>Back to feed</Text>
              </Pressable>
            </View>
          </View>
        )}

        {ready && (
          <View style={styles.body}>
            {/* tap zones: left = back, right = next */}
            <Pressable style={styles.zoneLeft} onPress={prev} accessibilityRole="button" accessibilityLabel="Previous page" />
            <Pressable style={styles.zoneRight} onPress={next} accessibilityRole="button" accessibilityLabel={current ? 'Next page' : 'Close story'} />
            {/* Text never blocks taps (so tapping anywhere turns the page), except the end buttons. */}
            <Animated.View style={[styles.textBlock, !photo && styles.textCenter, { opacity: appear }]} pointerEvents={current ? 'none' : 'box-none'}>
              {current ? (
                <>
                  {!photo && <Text style={styles.bigEmoji}>{current.emoji || '🌿'}</Text>}
                  <Text style={[styles.heading, !photo && { textAlign: 'center' }]}>
                    {photo && current.emoji ? `${current.emoji} ` : ''}
                    {current.heading}
                  </Text>
                  <Text style={[styles.text, !photo && { textAlign: 'center' }]}>{current.text}</Text>
                  <Text style={[styles.hint, !photo && { textAlign: 'center' }]}>
                    {page + 1} of {pages.length} · tap to keep going
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.bigEmoji}>📸</Text>
                  <Text style={[styles.heading, { textAlign: 'center' }]}>Can you find {withArticle((story?.species ?? 'one').toLowerCase())}?</Text>
                  <Text style={[styles.text, { textAlign: 'center' }]}>Snap one and it goes in your journal, with points.</Text>
                  <View style={styles.endBtns} pointerEvents="box-none">
                    <Pressable onPress={() => router.replace('/capture/camera')} style={styles.btn} accessibilityRole="button">
                      <Ionicons name="camera" size={16} color="#1a0d03" />
                      <Text style={styles.btnText}>Open camera</Text>
                    </Pressable>
                    <Pressable onPress={close} style={[styles.btn, styles.btnGhost]} accessibilityRole="button">
                      <Text style={[styles.btnText, { color: '#fff' }]}>Back to feed</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Animated.View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  dim: { backgroundColor: 'rgba(8,14,10,0.62)' },
  top: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, zIndex: 2 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: font.small, fontFamily: fonts.bodyBold, color: '#fff' },
  storyTitle: { fontSize: font.tiny, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '90%' },
  credit: { fontSize: 10, color: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  flag: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  loadingEmoji: { fontSize: 64, lineHeight: 78, textAlign: 'center' },
  loadingTitle: { fontSize: 26, lineHeight: 32, fontFamily: fonts.heading, color: '#fff', textAlign: 'center' },
  loadingText: { fontSize: font.body, lineHeight: 23, color: 'rgba(255,255,255,0.92)', textAlign: 'center', fontFamily: fonts.bodyMedium },
  body: { flex: 1 },
  zoneLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', zIndex: 1 },
  zoneRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%', zIndex: 1 },
  textBlock: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm, zIndex: 2 },
  textCenter: { justifyContent: 'center', alignItems: 'center' },
  bigEmoji: { fontSize: 84, lineHeight: 100, textAlign: 'center', marginBottom: spacing.sm },
  heading: { fontSize: 28, lineHeight: 34, fontFamily: fonts.heading, color: '#fff' },
  text: { fontSize: 20, lineHeight: 29, fontFamily: fonts.bodyMedium, color: 'rgba(255,255,255,0.95)' },
  hint: { fontSize: font.tiny, color: 'rgba(255,255,255,0.7)', marginTop: spacing.xs },
  endBtns: { gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch', zIndex: 3 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 13 },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  btnText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: '#1a0d03' },
});
