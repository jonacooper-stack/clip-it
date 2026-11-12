import { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CrewAvatar } from './CrewAvatar';
import { CrewBadge } from '@/components/social/CrewBadge';
import { useCrewStore } from '@/state/useCrewStore';
import { followUser, unfollowUser } from '@/lib/social';
import { timeAgo } from '@/lib/timeAgo';
import { resolvePhoto } from '@/lib/photoStore';
import { colors, spacing, font, fonts, radius } from '@/theme';
import type { Moment, Slide, Tone } from '@/lib/crew/moments';
import { setStoryCover, type StoryRef } from '@/lib/crew/api';
import { askReportPhoto } from './reportPhoto';

// One Scout post in the feed, shaped like a wall post: header, a square
// swipeable carousel (one picture + one short line per slide), dots, caption.

const TONES: Record<Tone, { bg: string; ring: string }> = {
  green: { bg: '#1E5E3A', ring: '#2C7A4D' },
  orange: { bg: '#A9501A', ring: '#C4652A' },
  blue: { bg: '#25506C', ring: '#33688A' },
  gold: { bg: '#7E6114', ring: '#9A781F' },
  clay: { bg: '#7A3F24', ring: '#94522F' },
};

// A soft dark fade behind text on photos (stacked bands; no native gradient
// module needed, so it ships over the air).
const FADE = Array.from({ length: 14 }, (_, i) => 0.78 * Math.pow((i + 1) / 14, 1.6));

// Open the full-screen story reader for a post or slide. The tapped slide's
// photo and emoji go along (in memory) so the reader opens on something
// familiar while the story loads.
export function openStory(router: ReturnType<typeof useRouter>, r: StoryRef, from?: Pick<Slide, 'photo' | 'emoji'>) {
  setStoryCover(r, { photo: from?.photo?.credit ? from.photo : undefined, emoji: from?.emoji });
  router.push({ pathname: '/story', params: { ...r } } as any);
}

export function ScoutPost({ moment }: { moment: Moment }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const n = moment.slides.length;
  const story = moment.slides[index]?.story ?? moment.story;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <CrewAvatar crew="scout" size={38} />
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>Scout</Text>
            <CrewBadge small />
          </View>
          <Text style={styles.time}>{moment.kind === 'region' ? 'Your AI field guide' : timeAgo(new Date(moment.at).toISOString())}</Text>
        </View>
      </View>

      <Carousel slides={moment.slides} index={index} onIndex={setIndex} story={moment.story} context={moment.caption} />

      {(n > 1 || story) && (
        <View style={styles.actions}>
          {story ? (
            <Pressable onPress={() => openStory(router, story, moment.slides[index])} style={styles.storyBtn} hitSlop={6} accessibilityRole="button">
              <Ionicons name="book-outline" size={15} color={colors.accentInk} />
              <Text style={styles.storyText} numberOfLines={1}>
                Read the story
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentInk} />
            </Pressable>
          ) : (
            <View />
          )}
          {n > 1 && (
            <View style={styles.dots}>
              {moment.slides.map((s, i) => (
                <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          )}
        </View>
      )}
      <View style={[styles.body, n <= 1 && { paddingTop: spacing.sm + 2 }]}>
        <Text style={styles.caption}>
          <Text style={styles.captionName}>Scout </Text>
          {moment.caption}
          {n > 1 && index < n - 1 && <Text style={styles.swipe}>  Swipe →</Text>}
        </Text>
      </View>
    </View>
  );
}

function Carousel({
  slides,
  index,
  onIndex,
  story,
  context,
}: {
  slides: Slide[];
  index: number;
  onIndex: (i: number) => void;
  story?: StoryRef;
  context: string;
}) {
  const [w, setW] = useState(0);
  const ref = useRef<ScrollView>(null);
  const n = slides.length;
  const go = (i: number) => ref.current?.scrollTo({ x: Math.max(0, Math.min(n - 1, i)) * w, animated: true });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!w) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / w);
    if (i !== index) onIndex(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <View style={styles.frame} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      {w > 0 && (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          decelerationRate="fast"
          scrollEnabled={n > 1}
        >
          {slides.map((s) => (
            <SlideView key={s.key} slide={s} size={w} story={s.story ?? story} context={context} />
          ))}
        </ScrollView>
      )}
      {n > 1 && (
        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterText}>
            {index + 1}/{n}
          </Text>
        </View>
      )}
      {Platform.OS === 'web' && n > 1 && index > 0 && (
        <Pressable onPress={() => go(index - 1)} style={[styles.arrow, { left: 10 }]} accessibilityLabel="Previous">
          <Ionicons name="chevron-back" size={18} color="#1b1b1b" />
        </Pressable>
      )}
      {Platform.OS === 'web' && n > 1 && index < n - 1 && (
        <Pressable onPress={() => go(index + 1)} style={[styles.arrow, { right: 10 }]} accessibilityLabel="Next">
          <Ionicons name="chevron-forward" size={18} color="#1b1b1b" />
        </Pressable>
      )}
    </View>
  );
}

// Follow / Following, right on a suggestion slide.
function FollowButton({ userId, name }: { userId: string; name: string }) {
  const followed = useCrewStore((s) => s.followed.includes(userId));
  const setFollowed = useCrewStore((s) => s.setFollowed);
  const toggle = () => {
    const next = !followed;
    setFollowed(userId, next);
    (next ? followUser(userId) : unfollowUser(userId)).then((r) => {
      if (r.error) setFollowed(userId, !next);
    });
  };
  return (
    <Pressable
      onPress={toggle}
      hitSlop={6}
      style={[styles.follow, followed && styles.following]}
      accessibilityRole="button"
      accessibilityLabel={followed ? `Unfollow ${name}` : `Follow ${name}`}
    >
      {followed && <Ionicons name="checkmark" size={15} color="#fff" />}
      <Text style={[styles.followText, followed && { color: '#fff' }]}>{followed ? 'Following' : 'Follow'}</Text>
    </Pressable>
  );
}

function SlideView({ slide, size, story, context }: { slide: Slide; size: number; story?: StoryRef; context: string }) {
  const router = useRouter();
  // A photo that can't be loaded (a purged file, a dead link) falls back to
  // the slide's emoji card instead of an empty frame.
  const [photoFailed, setPhotoFailed] = useState(false);
  const open = slide.href ? () => router.push(slide.href as any) : story ? () => openStory(router, story, slide) : undefined;
  const cta = slide.follow ? (
    <FollowButton userId={slide.follow.userId} name={slide.follow.name} />
  ) : slide.cta ? (
    <View style={styles.cta}>
      <Text style={styles.ctaText}>{slide.cta}</Text>
      <Ionicons name="arrow-forward" size={14} color="#1a0d03" />
    </View>
  ) : null;
  const big = !slide.title; // story slides: the fact itself is the headline

  if (slide.photo && !photoFailed) {
    return (
      <Pressable onPress={open} disabled={!open} style={{ width: size, height: size }}>
        {/* The player's own photos are stored as refs relative to the app's
            documents folder; resolvePhoto turns them into loadable paths. */}
        <Image
          source={{ uri: resolvePhoto(slide.photo.uri) ?? slide.photo.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onError={() => setPhotoFailed(true)}
        />
        <View style={styles.fade} pointerEvents="none">
          {FADE.map((a, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${a.toFixed(3)})` }} />
          ))}
        </View>
        {!!slide.photo.credit && (
          <View style={styles.creditWrap}>
            <Pressable
              style={{ flexShrink: 1 }}
              disabled={!slide.photo.source}
              onPress={() => slide.photo?.source && Linking.openURL(slide.photo.source).catch(() => {})}
              hitSlop={6}
              accessibilityLabel={`Photo credit: ${slide.photo.credit}`}
            >
              <Text style={styles.credit} numberOfLines={1}>
                📷 {slide.photo.credit}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => askReportPhoto(slide.photo!.uri, { species: slide.photo!.species, context })}
              style={styles.flag}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Report this photo"
            >
              <Ionicons name="flag-outline" size={11} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
        )}
        <View style={styles.photoText}>
          {!!slide.kicker && <Text style={styles.kicker} numberOfLines={1}>{slide.kicker}</Text>}
          {!!slide.title && <Text style={styles.photoTitle}>{slide.title}</Text>}
          {!!slide.text && <Text style={big ? styles.photoBig : styles.photoLine}>{slide.text}</Text>}
          {cta && <View style={styles.photoCta}>{cta}</View>}
        </View>
      </Pressable>
    );
  }

  const tone = TONES[slide.tone ?? 'green'];
  return (
    <Pressable onPress={open} disabled={!open} style={[styles.emojiSlide, { width: size, height: size, backgroundColor: tone.bg }]}>
      <View style={[styles.ring, { borderColor: tone.ring, width: size * 1.1, height: size * 1.1, borderRadius: size * 0.55, top: -size * 0.45, right: -size * 0.45 }]} />
      <View style={[styles.ring, { borderColor: tone.ring, width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4, bottom: -size * 0.4, left: -size * 0.3 }]} />
      {!!slide.kicker && <Text style={[styles.kicker, styles.emojiKicker]} numberOfLines={1}>{slide.kicker}</Text>}
      <Text style={[styles.bigEmoji, { fontSize: Math.round(size * 0.2), lineHeight: Math.round(size * 0.26) }]}>{slide.emoji ?? '🦊'}</Text>
      {!!slide.title && <Text style={styles.emojiTitle}>{slide.title}</Text>}
      {!!slide.text && <Text style={big ? styles.emojiBig : styles.emojiLine}>{slide.text}</Text>}
      {!!slide.bullets?.length && (
        <View style={styles.bullets}>
          {slide.bullets.map((b) => (
            <Text key={b} style={styles.bullet} numberOfLines={1}>
              {b}
            </Text>
          ))}
        </View>
      )}
      {cta}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  headText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  time: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  frame: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  counter: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  counterText: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: '#fff' },
  arrow: { position: 'absolute', top: '50%', marginTop: -15, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%' },
  creditWrap: { position: 'absolute', top: 12, left: 12, maxWidth: '76%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, minHeight: 34 },
  storyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(244,129,47,0.35)' },
  storyText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.accentInk },
  credit: { fontSize: 10, color: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  photoText: { position: 'absolute', left: 18, right: 18, bottom: 20, gap: 6 },
  photoTitle: { fontSize: 23, lineHeight: 28, fontFamily: fonts.heading, color: '#fff' },
  photoLine: { fontSize: 17, lineHeight: 23, fontFamily: fonts.bodyMedium, color: 'rgba(255,255,255,0.94)' },
  photoBig: { fontSize: 21, lineHeight: 27, fontFamily: fonts.heading, color: '#fff' },
  photoCta: { alignSelf: 'flex-start', marginTop: 4 },
  kicker: { fontSize: 11, fontFamily: fonts.bodyBold, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 },
  emojiKicker: { position: 'absolute', top: 16, left: 18, right: 64 },
  emojiBig: { fontSize: 22, lineHeight: 29, fontFamily: fonts.heading, color: '#fff', textAlign: 'center' },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 9 },
  following: { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  followText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: '#111' },
  emojiSlide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Platform.OS === 'web' ? 52 : 28, gap: 10, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 2, opacity: 0.55 },
  bigEmoji: { textAlign: 'center', marginBottom: 4 },
  emojiTitle: { fontSize: 24, lineHeight: 29, fontFamily: fonts.heading, color: '#fff', textAlign: 'center' },
  emojiLine: { fontSize: 18, lineHeight: 25, fontFamily: fonts.bodyMedium, color: 'rgba(255,255,255,0.94)', textAlign: 'center' },
  bullets: { alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, gap: 6, marginTop: 2 },
  bullet: { fontSize: 16, lineHeight: 22, fontFamily: fonts.bodyMedium, color: '#fff' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  ctaText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: '#1a0d03' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotOn: { backgroundColor: colors.primary },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  caption: { fontSize: font.small, color: colors.text, lineHeight: 20 },
  captionName: { fontFamily: fonts.bodyBold },
  swipe: { fontFamily: fonts.bodyBold, color: colors.accentInk },
});
