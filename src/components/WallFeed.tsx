import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { UserAvatar } from '@/components/UserAvatar';
import { Segmented, Loading, Empty } from '@/components/social/parts';
import { timeAgo } from '@/lib/timeAgo';
import { colors, spacing, font, fonts, radius } from '@/theme';
import {
  getFeed, likePost, unlikePost, followUser, unfollowUser, deletePost,
  type FeedPost, type FeedScope,
} from '@/lib/social';

// The Instagram-style wall feed — scope toggle + a column of big-image posts.
// Used as the app's home Feed and reusable anywhere.
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
        setError(res.error ?? null);
      });
      return () => { on = false; };
    }, [scope]),
  );

  const onRemoved = (id: string) => setPosts((ps) => (ps ? ps.filter((p) => p.id !== id) : ps));

  return (
    <ScrollView contentContainerStyle={styles.feed} showsVerticalScrollIndicator={false}>
      <View style={styles.feedToggle}>
        <Segmented
          value={scope}
          onChange={(v) => setScope(v as FeedScope)}
          options={[{ value: 'everyone', label: 'Everyone' }, { value: 'following', label: 'Following' }]}
        />
      </View>
      {posts === null ? (
        <Loading />
      ) : error ? (
        <Empty icon="cloud-offline-outline" text={`Couldn’t load the wall.\n${error}`} />
      ) : posts.length === 0 ? (
        <Empty
          icon="images-outline"
          text={scope === 'following' ? 'Follow people to fill your feed — tap Follow on any post, or find friends in Community.' : 'Nothing shared yet. Tap the camera to ClipIt your first sighting!'}
        />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onRemoved={onRemoved} />)
      )}
    </ScrollView>
  );
}

// One post: big image, like + comment + follow, caption, and (for your own
// posts) an unshare control.
function PostCard({ post, onRemoved }: { post: FeedPost; onRemoved: (id: string) => void }) {
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
          if (res.error) Alert.alert('Couldn’t unshare', res.error);
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
          <Text style={styles.igName} numberOfLines={1}>{post.displayName}</Text>
          <Text style={styles.igTime} numberOfLines={1}>{timeAgo(post.createdAt)}</Text>
        </View>
        {post.isMine ? (
          <Pressable onPress={confirmUnshare} hitSlop={10} style={styles.moreBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </Pressable>
        ) : (
          <Pressable onPress={toggleFollow} style={[styles.followBtn, following && styles.followingBtn]}>
            <Text style={[styles.followText, following && styles.followingText]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
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
  feedToggle: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  igCard: { marginBottom: spacing.lg },
  igHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  igHeadText: { flex: 1 },
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
