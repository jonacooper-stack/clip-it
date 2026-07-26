import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { UserAvatar } from '@/components/UserAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useJournalStore, totalPoints, distinctSpecies } from '@/state/useJournalStore';
import {
  syncMyProfile, getLeaderboard, getFeed, getFriends, searchUsers,
  sendFriendRequest, acceptFriendRequest, likePost, unlikePost, followUser, unfollowUser,
  type Scope, type FeedScope, type LeaderboardEntry, type FeedPost, type FriendsState,
} from '@/lib/social';

const webInputReset: any =
  Platform.OS === 'web' ? { outlineStyle: 'none', borderWidth: 0, backgroundColor: 'transparent' } : null;

type Tab = 'leaderboard' | 'wall' | 'friends';

export default function Social() {
  const displayName = useAppStore((s) => s.displayName);
  const sightings = useJournalStore((s) => s.sightings);
  const points = totalPoints(sightings);
  const speciesCount = distinctSpecies(sightings).length;
  const [tab, setTab] = useState<Tab>('leaderboard');

  // Keep my leaderboard row current whenever my totals change.
  useEffect(() => {
    syncMyProfile(displayName, points, speciesCount);
  }, [displayName, points, speciesCount]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Community</Text>
      </View>
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: 'leaderboard', label: 'Leaderboard' },
          { value: 'wall', label: 'Wall' },
          { value: 'friends', label: 'Friends' },
        ]}
        style={styles.tabs}
      />
      {tab === 'leaderboard' && <LeaderboardView />}
      {tab === 'wall' && <WallView />}
      {tab === 'friends' && <FriendsView />}
    </SafeAreaView>
  );
}

function LeaderboardView() {
  const [scope, setScope] = useState<Scope>('everyone');
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let on = true;
    setRows(null);
    getLeaderboard(scope).then((r) => on && setRows(r));
    return () => { on = false; };
  }, [scope]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScopeToggle scope={scope} onChange={setScope} />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty icon="podium-outline" text={scope === 'friends' ? 'Add friends to see how you stack up.' : 'No one on the board yet — be the first!'} />
      ) : (
        rows.map((r, i) => (
          <Card key={r.id} style={[styles.row, r.isMe && styles.rowMe]}>
            <Text style={[styles.rank, i < 3 && styles.rankTop]}>{i + 1}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {r.displayName}{r.isMe ? ' (you)' : ''}
              </Text>
              <Text style={styles.rowSub}>{r.speciesCount} species</Text>
            </View>
            <Text style={styles.rowPts}>{r.points}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function WallView() {
  const [scope, setScope] = useState<FeedScope>('everyone');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload on scope change and whenever the tab regains focus, so a sighting you
  // just shared (or a like/comment) shows up without a manual refresh.
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
          text={scope === 'following' ? 'Follow people to fill your feed — tap Follow on any post, or find friends.' : 'Nothing shared yet. Spot something and tap “Share to wall”!'}
        />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} />)
      )}
    </ScrollView>
  );
}

// One Instagram-style card: big image, like + comment + follow, caption.
function PostCard({ post }: { post: FeedPost }) {
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

  const openComments = () => router.push(`/post/${post.id}`);

  return (
    <View style={styles.igCard}>
      <View style={styles.igHead}>
        <UserAvatar name={post.displayName} size={38} />
        <View style={styles.igHeadText}>
          <Text style={styles.igName} numberOfLines={1}>{post.displayName}</Text>
          <Text style={styles.igTime} numberOfLines={1}>{timeAgo(post.createdAt)}</Text>
        </View>
        {!post.isMine && (
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

function FriendsView() {
  const [state, setState] = useState<FriendsState | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; displayName: string }[]>([]);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    getFriends().then(setState);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let on = true;
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { searchUsers(query).then((r) => on && setResults(r)); }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [query]);

  const onAdd = async (id: string) => {
    setSent((s) => ({ ...s, [id]: true }));
    await sendFriendRequest(id);
    refresh();
  };
  const onAccept = async (friendshipId: string) => {
    await acceptFriendRequest(friendshipId);
    refresh();
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find friends by name"
          placeholderTextColor={colors.faint}
          style={[styles.searchInput, webInputReset]}
          autoCapitalize="none"
        />
      </View>

      {results.map((r) => (
        <Card key={r.id} style={styles.frow}>
          <Ionicons name="person-circle-outline" size={28} color={colors.muted} />
          <Text style={styles.frowName} numberOfLines={1}>{r.displayName}</Text>
          <Pressable onPress={() => onAdd(r.id)} disabled={sent[r.id]} style={[styles.btn, sent[r.id] && styles.btnDone]}>
            <Text style={styles.btnText}>{sent[r.id] ? 'Sent' : 'Add'}</Text>
          </Pressable>
        </Card>
      ))}

      {state === null ? (
        <Loading />
      ) : (
        <>
          {state.incoming.length > 0 && (
            <Section title="Requests">
              {state.incoming.map((f) => (
                <Card key={f.id} style={styles.frow}>
                  <Ionicons name="person-add-outline" size={24} color={colors.accent} />
                  <Text style={styles.frowName} numberOfLines={1}>{f.displayName}</Text>
                  <Pressable onPress={() => onAccept(f.id)} style={styles.btn}>
                    <Text style={styles.btnText}>Accept</Text>
                  </Pressable>
                </Card>
              ))}
            </Section>
          )}

          <Section title={`Friends${state.friends.length ? ` (${state.friends.length})` : ''}`}>
            {state.friends.length === 0 ? (
              <Empty icon="people-outline" text="No friends yet. Search above to send a request — they’ll appear once both of you opt in." />
            ) : (
              state.friends.map((f) => (
                <Card key={f.id} style={styles.frow}>
                  <Ionicons name="person-circle" size={28} color={colors.primary} />
                  <Text style={styles.frowName} numberOfLines={1}>{f.displayName}</Text>
                </Card>
              ))
            )}
          </Section>

          {state.outgoing.length > 0 && (
            <Section title="Pending">
              {state.outgoing.map((f) => (
                <Card key={f.id} style={styles.frow}>
                  <Ionicons name="time-outline" size={24} color={colors.faint} />
                  <Text style={styles.frowName} numberOfLines={1}>{f.displayName}</Text>
                  <Text style={styles.frowPending}>requested</Text>
                </Card>
              ))}
            </Section>
          )}
        </>
      )}
    </ScrollView>
  );
}

// --- small shared pieces ---

function Segmented({ value, onChange, options, style }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; style?: any;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ScopeToggle({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <Segmented
      value={scope}
      onChange={(v) => onChange(v as Scope)}
      options={[{ value: 'everyone', label: 'Everyone' }, { value: 'friends', label: 'Friends' }]}
      style={styles.scope}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Loading() {
  return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />;
}

function Empty({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={34} color={colors.faint} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  tabs: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  content: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },

  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted },
  segmentTextActive: { color: colors.white },
  scope: { marginBottom: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, paddingVertical: spacing.md },
  rowMe: { borderColor: colors.primary, borderWidth: 1.5 },
  rank: { width: 28, textAlign: 'center', fontSize: font.body, fontFamily: fonts.display, color: colors.faint },
  rankTop: { color: colors.accent },
  rowBody: { flex: 1 },
  rowName: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  rowSub: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  rowPts: { fontSize: font.heading, fontFamily: fonts.display, color: colors.primary },

  // Instagram-style wall feed — edge-to-edge, image-forward.
  feed: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  feedToggle: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  igCard: { marginBottom: spacing.lg },
  igHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  igHeadText: { flex: 1 },
  igName: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  igTime: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
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

  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 4, fontSize: font.body, fontFamily: fonts.body, color: colors.text },

  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: font.small, fontFamily: fonts.bodyBold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted, marginBottom: spacing.sm },
  frow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  frowName: { flex: 1, fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  frowPending: { fontSize: font.tiny, color: colors.faint, fontStyle: 'italic' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnDone: { backgroundColor: colors.primarySoft },
  btnText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.white },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
