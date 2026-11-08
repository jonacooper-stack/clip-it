import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { UserAvatar } from '@/components/UserAvatar';
import { Segmented, Loading, Empty } from '@/components/social/parts';
import { SafetySheet, type SafetyTarget } from '@/components/social/SafetySheet';
import { CrewBadge } from '@/components/social/CrewBadge';
import { InboxCard } from '@/components/crew/InboxCard';
import { YourWeekCard } from '@/components/crew/YourWeekCard';
import { useAppStore } from '@/state/useAppStore';
import { useCrewInbox } from '@/lib/crew/useCrewInbox';
import { FEED_KINDS, type InboxItem } from '@/lib/crew/inbox';
import { addDays, startOfDay } from '@/lib/crew/time';
import { timeAgo } from '@/lib/timeAgo';
import { colors, spacing, font, fonts, radius } from '@/theme';
import {
  getFeed, likePost, unlikePost, followUser, unfollowUser, deletePost, friendlyError,
  type FeedPost, type FeedScope,
} from '@/lib/social';

type FeedEntry = { key: string; at: number } & ({ type: 'post'; post: FeedPost } | { type: 'crew'; item: InboxItem });

const CREW_WINDOW_MS = 14 * 86_400_000;

// Magpie's weekly picks: the most-liked posts of the past week, on Sunday evening.
function magpiePicks(posts: FeedPost[], now: number): InboxItem | null {
  const today = startOfDay(now);
  const back = (new Date(today).getDay() + 7) % 7; // days since Sunday
  let at = addDays(today, -back) + 17 * 3600_000;
  if (at > now) at = addDays(at, -7);
  const top = posts
    .filter((p) => !p.isBot && p.photoUrl && p.likeCount > 0 && Date.parse(p.createdAt) <= at && Date.parse(p.createdAt) > at - 7 * 86_400_000)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 3);
  if (top.length < 2) return null;
  return {
    id: `magpie_picks:${at}`,
    crew: 'magpie',
    kind: 'magpie',
    at,
    title: 'Magpie’s picks of the week',
    body: 'The shiniest sightings from the wall this week. Into the collection they go!',
    others: top.map((p) => ({ postId: p.id, photoUrl: p.photoUrl!, name: p.displayName, likes: p.likeCount, createdAt: p.createdAt })),
  };
}

// The home feed: one timeline of wall posts and Field Crew moments (facts,
// forecasts, challenges, duel updates), newest first, with the week's
// challenges and duel pinned on top.
export function WallFeed() {
  const [scope, setScope] = useState<FeedScope>('everyone');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload on scope change and whenever the screen regains focus, so a sighting
  // you just shared (or a like/comment) shows up without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      let on = true;
      setPosts(null);
      setError(null);
      getFeed(scope).then((res) => {
        if (!on) return;
        setPosts(res.posts);
        if (res.error) console.warn('[wall]', res.error);
        setError(res.error ?? null);
      });
      return () => { on = false; };
    }, [scope]),
  );

  const [safety, setSafety] = useState<SafetyTarget | null>(null);
  const showCrew = useAppStore((s) => s.showCrew);
  const markCrewSeen = useAppStore((s) => s.markCrewSeen);
  const { items: crewItems } = useCrewInbox();

  // New crew cards are highlighted while you look; leaving the feed marks
  // them seen (so the bell only counts what you haven't seen anywhere).
  const seenAtOpen = useRef(useAppStore.getState().crewSeenAt);
  useFocusEffect(
    useCallback(() => {
      seenAtOpen.current = useAppStore.getState().crewSeenAt;
      return () => markCrewSeen();
    }, [markCrewSeen]),
  );

  const now = Date.now();
  const pinnedRegion = showCrew ? crewItems.find((i) => i.kind === 'region') : undefined;
  const week = crewItems.find((i) => i.kind === 'challenges');
  const duel = crewItems.find((i) => i.kind === 'duel')?.duel;
  const intro = crewItems.find((i) => i.kind === 'intro');
  const timeline = useMemo<FeedEntry[]>(() => {
    const out: FeedEntry[] = (posts ?? []).map((p) => ({ key: `post:${p.id}`, at: Date.parse(p.createdAt), type: 'post', post: p }));
    if (showCrew) {
      for (const it of crewItems) {
        if (FEED_KINDS.has(it.kind) && now - it.at < CREW_WINDOW_MS) out.push({ key: `crew:${it.id}`, at: it.at, type: 'crew', item: it });
      }
      const picks = magpiePicks(posts ?? [], now);
      if (picks && now - picks.at < CREW_WINDOW_MS) out.push({ key: `crew:${picks.id}`, at: picks.at, type: 'crew', item: picks });
    }
    return out.sort((a, b) => b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, crewItems, showCrew]);
  const crewCount = timeline.filter((e) => e.type === 'crew').length;

  const onRemoved = (id: string) => setPosts((ps) => (ps ? ps.filter((p) => p.id !== id) : ps));
  const onBlocked = (userId: string) => setPosts((ps) => (ps ? ps.filter((p) => p.userId !== userId) : ps));

  return (
    <ScrollView contentContainerStyle={styles.feed} showsVerticalScrollIndicator={false}>
      {pinnedRegion && (
        <View style={styles.crewWrap}>
          <InboxCard item={pinnedRegion} />
        </View>
      )}
      {showCrew && week?.challenges && duel && <YourWeekCard challenges={week.challenges} duel={duel} />}
      <View style={styles.feedToggle}>
        <Segmented
          value={scope}
          onChange={(v) => setScope(v as FeedScope)}
          options={[{ value: 'everyone', label: 'Everyone' }, { value: 'following', label: 'Following' }]}
        />
      </View>
      {posts === null && crewCount === 0 ? (
        <Loading />
      ) : (
        <>
          {error && (
            <Text style={styles.inlineNote}>Couldn’t load posts from the wall right now. Check your connection and try again in a moment.</Text>
          )}
          {!error && posts?.length === 0 && (
            <Text style={styles.inlineNote}>
              {scope === 'following'
                ? 'Follow people to see their posts here: tap Follow on any post, or find friends in Community.'
                : 'No posts on the wall yet. Tap the camera to ClipIt your first sighting!'}
            </Text>
          )}
          {timeline.map((e) =>
            e.type === 'post' ? (
              <PostCard key={e.key} post={e.post} onRemoved={onRemoved} onMore={setSafety} />
            ) : (
              <View key={e.key} style={styles.crewWrap}>
                <InboxCard item={e.item} unread={e.item.at > seenAtOpen.current} />
              </View>
            ),
          )}
          {showCrew && intro && crewCount < 8 && (
            <View style={styles.crewWrap}>
              <InboxCard item={intro} />
            </View>
          )}
          {timeline.length === 0 && !showCrew && !error && posts?.length === 0 && (
            <Empty icon="images-outline" text="Nothing here yet. Tap the camera to ClipIt your first sighting!" />
          )}
        </>
      )}
      <SafetySheet
        target={safety}
        onClose={() => setSafety(null)}
        onBlocked={onBlocked}
        onReported={(t) => onRemoved(t.id)}
      />
    </ScrollView>
  );
}

// One post: big image, like + comment + follow, caption, and (for your own
// posts) an unshare control.
function PostCard({
  post,
  onRemoved,
  onMore,
}: {
  post: FeedPost;
  onRemoved: (id: string) => void;
  onMore: (t: SafetyTarget) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [following, setFollowing] = useState(post.isFollowing);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    (next ? likePost(post.id) : unlikePost(post.id)).then((r) => {
      if (r.error) { setLiked(!next); setLikeCount((c) => Math.max(0, c + (next ? -1 : 1))); }
    });
  };

  const toggleFollow = () => {
    const next = !following;
    setFollowing(next);
    (next ? followUser(post.userId) : unfollowUser(post.userId)).then((r) => {
      if (r.error) setFollowing(!next);
    });
  };

  const confirmUnshare = () => {
    Alert.alert('Remove from wall?', 'This unshares the post for everyone. Your sighting stays in your journal.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unshare',
        style: 'destructive',
        onPress: async () => {
          onRemoved(post.id); // optimistic
          const res = await deletePost(post.id, post.photoUrl);
          if (res.error) Alert.alert('Couldn’t unshare', friendlyError(res.error));
        },
      },
    ]);
  };

  const openComments = () => router.push(`/post/${post.id}`);

  return (
    <View style={styles.igCard}>
      <View style={styles.igHead}>
        <UserAvatar name={post.displayName} uri={post.avatarUrl} size={38} />
        <View style={styles.igHeadText}>
          <View style={styles.nameRow}>
            <Text style={styles.igName} numberOfLines={1}>{post.displayName}</Text>
            {post.isBot && <CrewBadge small />}
          </View>
          <Text style={styles.igTime} numberOfLines={1}>{timeAgo(post.createdAt)}</Text>
        </View>
        {post.isMine ? (
          <Pressable onPress={confirmUnshare} hitSlop={10} style={styles.moreBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </Pressable>
        ) : (
          <>
            <Pressable onPress={toggleFollow} style={[styles.followBtn, following && styles.followingBtn]}>
              <Text style={[styles.followText, following && styles.followingText]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onMore({ type: 'post', id: post.id, userId: post.userId, displayName: post.displayName })}
              hitSlop={10}
              style={styles.moreBtn}
              accessibilityLabel="Report or block"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
            </Pressable>
          </>
        )}
      </View>

      <Pressable onPress={openComments}>
        {post.photoUrl ? (
          <Image source={{ uri: post.photoUrl }} style={styles.igPhoto} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.igPhotoFallback}>
            <SpeciesAvatar scientificName={post.scientificName ?? undefined} size={96} />
          </View>
        )}
      </Pressable>

      <View style={styles.igActions}>
        <Pressable onPress={toggleLike} hitSlop={8} style={styles.igAction}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? colors.danger : colors.text} />
          {likeCount > 0 && <Text style={styles.igActionCount}>{likeCount}</Text>}
        </Pressable>
        <Pressable onPress={openComments} hitSlop={8} style={styles.igAction}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          {post.commentCount > 0 && <Text style={styles.igActionCount}>{post.commentCount}</Text>}
        </Pressable>
        <View style={{ flex: 1 }} />
        {post.points > 0 && (
          <View style={styles.igPts}>
            <Ionicons name="flame" size={13} color={colors.accentInk} />
            <Text style={styles.igPtsText}>{post.points}</Text>
          </View>
        )}
      </View>

      <View style={styles.igBody}>
        <Text style={styles.igCaption}>
          <Text style={styles.igCaptionName}>{post.displayName}</Text>
          {post.commonName ? <Text> spotted a </Text> : <Text> shared a sighting</Text>}
          {post.commonName && <Text style={styles.igSpecies}>{post.commonName}</Text>}
        </Text>
        {!!post.caption && <Text style={styles.igText}>{post.caption}</Text>}
        {post.commentCount > 0 && (
          <Pressable onPress={openComments}>
            <Text style={styles.igViewComments}>
              View {post.commentCount === 1 ? '1 comment' : `all ${post.commentCount} comments`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feed: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  crewWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  inlineNote: { fontSize: font.small, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.xl, marginBottom: spacing.lg, lineHeight: 20 },
  feedToggle: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  igCard: { marginBottom: spacing.lg },
  igHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  igHeadText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  credit: { fontSize: 10, color: colors.faint, paddingHorizontal: spacing.md, paddingTop: 6 },
  igName: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  igTime: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  moreBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  followBtn: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.primary },
  followingBtn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  followText: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.white },
  followingText: { color: colors.muted },
  igPhoto: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt },
  igPhotoFallback: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  igActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  igAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  igActionCount: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  igPts: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  igPtsText: { fontSize: font.small, fontFamily: fonts.display, color: colors.accentInk },
  igBody: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 3 },
  igCaption: { fontSize: font.small, color: colors.text, lineHeight: 20 },
  igCaptionName: { fontFamily: fonts.bodyBold, color: colors.text },
  igSpecies: { fontFamily: fonts.bodyBold, color: colors.primary },
  igText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  igViewComments: { fontSize: font.small, color: colors.faint, marginTop: 2 },
});
