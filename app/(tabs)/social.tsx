import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useJournalStore, totalPoints, distinctSpecies } from '@/state/useJournalStore';
import {
  syncMyProfile, getLeaderboard, getFeed, getFriends, searchUsers,
  sendFriendRequest, acceptFriendRequest, type Scope, type LeaderboardEntry,
  type FeedPost, type FriendsState,
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
  const [scope, setScope] = useState<Scope>('everyone');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let on = true;
    setPosts(null);
    getFeed(scope).then((p) => on && setPosts(p));
    return () => { on = false; };
  }, [scope]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScopeToggle scope={scope} onChange={setScope} />
      {posts === null ? (
        <Loading />
      ) : posts.length === 0 ? (
        <Empty icon="images-outline" text={scope === 'friends' ? 'Your friends haven’t shared sightings yet.' : 'Nothing shared yet. Spot something and tap “Share to wall”!'} />
      ) : (
        posts.map((p) => (
          <Card key={p.id} style={styles.post}>
            <View style={styles.postHead}>
              <SpeciesAvatar scientificName={p.scientificName ?? undefined} size={44} />
              <View style={styles.postHeadText}>
                <Text style={styles.postSpecies} numberOfLines={1}>{p.commonName ?? 'A wild sighting'}</Text>
                <Text style={styles.postMeta} numberOfLines={1}>{p.displayName} · {timeAgo(p.createdAt)}</Text>
              </View>
              <Text style={styles.postPts}>{p.points} pts</Text>
            </View>
            {!!p.caption && <Text style={styles.postCaption}>{p.caption}</Text>}
          </Card>
        ))
      )}
    </ScrollView>
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

  post: { marginBottom: spacing.md },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  postHeadText: { flex: 1 },
  postSpecies: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  postMeta: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  postPts: { fontSize: font.small, fontFamily: fonts.display, color: colors.accentInk },
  postCaption: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginTop: spacing.sm },

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
