import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { UserAvatar } from '@/components/UserAvatar';
import { timeAgo } from '@/lib/timeAgo';
import { colors, spacing, font, fonts, radius } from '@/theme';
import {
  getPost, getComments, addComment, likePost, unlikePost, deletePost,
  type FeedPost, type Comment,
} from '@/lib/social';

const webInputReset: any =
  Platform.OS === 'web' ? { outlineStyle: 'none' } : null;

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<FeedPost | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const unshare = () => {
    if (!post) return;
    Alert.alert('Remove from wall?', 'This unshares the post for everyone. Your sighting stays in your journal.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unshare',
        style: 'destructive',
        onPress: async () => {
          const res = await deletePost(post.id, post.photoUrl);
          if (res.error) Alert.alert('Couldn’t unshare', res.error);
          else goBack();
        },
      },
    ]);
  };

  const loadComments = useCallback(() => {
    if (!id) return;
    getComments(id).then(setComments);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getPost(id).then(setPost);
    loadComments();
  }, [id, loadComments]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !id) return;
    setSending(true);
    const res = await addComment(id, text);
    setSending(false);
    if (!res.error) {
      setDraft('');
      loadComments();
      setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        {post && post.isMine ? (
          <Pressable onPress={unshare} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {post === undefined ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : post === null ? (
            <Text style={styles.missing}>This post is no longer available.</Text>
          ) : (
            <>
              <PostHeader post={post} onCountChange={(n) => setPost((p) => (p ? { ...p, likeCount: n } : p))} />

              <Text style={styles.commentsLabel}>
                {post.commentCount > 0 ? `Comments (${post.commentCount})` : 'Comments'}
              </Text>

              {comments === null ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
              ) : comments.length === 0 ? (
                <Text style={styles.noComments}>No comments yet. Be the first to say something!</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={styles.commentRow}>
                    <UserAvatar name={c.displayName} uri={c.avatarUrl} size={34} />
                    <View style={styles.commentBody}>
                      <Text style={styles.commentText}>
                        <Text style={styles.commentName}>{c.displayName}</Text>
                        <Text>  {c.body}</Text>
                      </Text>
                      <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>

        {post && (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={colors.faint}
              style={[styles.input, webInputReset]}
              multiline
              onSubmitEditing={send}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
            >
              {sending ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color={colors.white} />
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PostHeader({ post, onCountChange }: { post: FeedPost; onCountChange: (n: number) => void }) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  const toggleLike = () => {
    const next = !liked;
    const nextCount = Math.max(0, likeCount + (next ? 1 : -1));
    setLiked(next);
    setLikeCount(nextCount);
    onCountChange(nextCount);
    (next ? likePost(post.id) : unlikePost(post.id)).then((r) => {
      if (r.error) {
        const revert = Math.max(0, nextCount + (next ? -1 : 1));
        setLiked(!next);
        setLikeCount(revert);
        onCountChange(revert);
      }
    });
  };

  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <UserAvatar name={post.displayName} uri={post.avatarUrl} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.postName} numberOfLines={1}>{post.displayName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      {post.photoUrl ? (
        <Image source={{ uri: post.photoUrl }} style={styles.photo} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.photoFallback}>
          <SpeciesAvatar scientificName={post.scientificName ?? undefined} size={96} />
        </View>
      )}

      <View style={styles.actions}>
        <Pressable onPress={toggleLike} hitSlop={8} style={styles.action}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? colors.danger : colors.text} />
          {likeCount > 0 && <Text style={styles.actionCount}>{likeCount}</Text>}
        </Pressable>
        <View style={{ flex: 1 }} />
        {post.points > 0 && (
          <View style={styles.pts}>
            <Ionicons name="flame" size={13} color={colors.accentInk} />
            <Text style={styles.ptsText}>{post.points}</Text>
          </View>
        )}
      </View>

      <Text style={styles.caption}>
        <Text style={styles.captionName}>{post.displayName}</Text>
        {post.commonName ? <Text> spotted a </Text> : <Text> shared a sighting</Text>}
        {post.commonName && <Text style={styles.species}>{post.commonName}</Text>}
      </Text>
      {!!post.caption && <Text style={styles.captionText}>{post.caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  content: { paddingBottom: spacing.xl },
  missing: { textAlign: 'center', marginTop: spacing.xxl, color: colors.muted },

  post: { marginBottom: spacing.md },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  postName: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  postTime: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt },
  photoFallback: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  pts: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  ptsText: { fontSize: font.small, fontFamily: fonts.display, color: colors.accentInk },
  caption: { fontSize: font.small, color: colors.text, lineHeight: 20, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  captionName: { fontFamily: fonts.bodyBold, color: colors.text },
  species: { fontFamily: fonts.bodyBold, color: colors.primary },
  captionText: { fontSize: font.small, color: colors.muted, lineHeight: 20, paddingHorizontal: spacing.md, marginTop: 2 },

  commentsLabel: {
    fontSize: font.tiny, fontFamily: fonts.bodyBold, letterSpacing: 0.5, textTransform: 'uppercase',
    color: colors.muted, paddingHorizontal: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm,
  },
  noComments: { fontSize: font.small, color: colors.faint, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  commentRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  commentBody: { flex: 1 },
  commentText: { fontSize: font.small, color: colors.text, lineHeight: 20 },
  commentName: { fontFamily: fonts.bodyBold, color: colors.text },
  commentTime: { fontSize: font.tiny, color: colors.faint, marginTop: 2 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 40,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 10,
    fontSize: font.body, fontFamily: fonts.body, color: colors.text,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: colors.primarySoft },
});
