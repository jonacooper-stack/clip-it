import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { Segmented, Loading, Empty } from '@/components/social/parts';
import { SafetySheet, type SafetyTarget } from '@/components/social/SafetySheet';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import { playerPoints } from '@/lib/quests';
import {
  syncMyProfile, getLeaderboard, getFriends, searchUsers,
  sendFriendRequest, acceptFriendRequest, removeFriendship, type Scope, type LeaderboardEntry,
  type FriendsState,
} from '@/lib/social';

const webInputReset: any =
  Platform.OS === 'web' ? { outlineStyle: 'none', borderWidth: 0, backgroundColor: 'transparent' } : null;

type Tab = 'leaderboard' | 'friends';

export default function Community() {
  const displayName = useAppStore((s) => s.displayName);
  const avatarUrl = useAppStore((s) => s.avatarUrl);
  const sightings = useJournalStore((s) => s.sightings);
  const points = playerPoints(sightings);
  const speciesCount = distinctSpecies(sightings).length;
  const [tab, setTab] = useState<Tab>('leaderboard');
  // Report/block for any person shown here (App Store Guideline 1.2). Bumping
  // reloadKey after a block re-fetches the lists so they disappear at once.
  const [safety, setSafety] = useState<SafetyTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const onMore = (userId: string, name: string) =>
    setSafety({ type: 'user', id: userId, userId, displayName: name });

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
          { value: 'friends', label: 'Friends' },
        ]}
        style={styles.tabs}
      />
      {tab === 'leaderboard' && <LeaderboardView reloadKey={reloadKey} onMore={onMore} />}
      {tab === 'friends' && <FriendsView avatarUrl={avatarUrl} reloadKey={reloadKey} onMore={onMore} />}
      <SafetySheet
        target={safety}
        onClose={() => setSafety(null)}
        onBlocked={() => setReloadKey((k) => k + 1)}
      />
    </SafeAreaView>
  );
}

type MoreFn = (userId: string, name: string) => void;

// "•••" button that opens report/block for a person.
function MoreButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.more} accessibilityLabel="Report or block">
      <Ionicons name="ellipsis-horizontal" size={18} color={colors.faint} />
    </Pressable>
  );
}

function LeaderboardView({ reloadKey, onMore }: { reloadKey: number; onMore: MoreFn }) {
  const [scope, setScope] = useState<Scope>('everyone');
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let on = true;
    setRows(null);
    getLeaderboard(scope).then((r) => on && setRows(r));
    return () => { on = false; };
  }, [scope, reloadKey]);

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
            <UserAvatar name={r.displayName} uri={r.avatarUrl} size={40} />
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {r.displayName}{r.isMe ? ' (you)' : ''}
              </Text>
              <Text style={styles.rowSub}>{r.speciesCount} species</Text>
            </View>
            <Text style={styles.rowPts}>{r.points}</Text>
            {!r.isMe && <MoreButton onPress={() => onMore(r.id, r.displayName)} />}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function FriendsView({ reloadKey, onMore }: { avatarUrl: string | null; reloadKey: number; onMore: MoreFn }) {
  const [state, setState] = useState<FriendsState | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const refresh = useCallback(() => {
    getFriends().then(setState);
  }, []);
  useEffect(() => { refresh(); }, [refresh, reloadKey]);

  useEffect(() => {
    let on = true;
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { searchUsers(query).then((r) => on && setResults(r)); }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [query, reloadKey]);

  const onAdd = async (id: string) => {
    setSent((s) => ({ ...s, [id]: true }));
    await sendFriendRequest(id);
    refresh();
  };
  const onAccept = async (friendshipId: string) => {
    await acceptFriendRequest(friendshipId);
    refresh();
  };
  // Decline a request, cancel one I sent, or unfriend: all remove the row.
  const onRemove = async (friendshipId: string) => {
    await removeFriendship(friendshipId);
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
          <UserAvatar name={r.displayName} uri={r.avatarUrl} size={36} />
          <Text style={styles.frowName} numberOfLines={1}>{r.displayName}</Text>
          <Pressable onPress={() => onAdd(r.id)} disabled={sent[r.id]} style={[styles.btn, sent[r.id] && styles.btnDone]}>
            <Text style={styles.btnText}>{sent[r.id] ? 'Sent' : 'Add'}</Text>
          </Pressable>
          <MoreButton onPress={() => onMore(r.id, r.displayName)} />
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
                  <UserAvatar name={f.displayName} uri={f.avatarUrl} size={36} />
                  <Text style={styles.frowName} numberOfLines={1}>{f.displayName}</Text>
                  <Pressable onPress={() => onAccept(f.id)} style={styles.btn}>
                    <Text style={styles.btnText}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => onRemove(f.id)} style={[styles.btn, styles.btnGhost]}>
                    <Text style={[styles.btnText, styles.btnGhostText]}>Decline</Text>
                  </Pressable>
                  <MoreButton onPress={() => onMore(f.userId, f.displayName)} />
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
                  <UserAvatar name={f.displayName} uri={f.avatarUrl} size={36} />
                  <Text style={styles.frowName} numberOfLines={1}>{f.displayName}</Text>
                  <Pressable onPress={() => onRemove(f.id)} style={[styles.btn, styles.btnGhost]}>
                    <Text style={[styles.btnText, styles.btnGhostText]}>Remove</Text>
                  </Pressable>
                  <MoreButton onPress={() => onMore(f.userId, f.displayName)} />
                </Card>
              ))
            )}
          </Section>

          {state.outgoing.length > 0 && (
            <Section title="Pending">
              {state.outgoing.map((f) => (
                <Card key={f.id} style={styles.frow}>
                  <UserAvatar name={f.displayName} uri={f.avatarUrl} size={36} />
                  <Text style={styles.frowName} numberOfLines={1}>{f.displayName}</Text>
                  <Text style={styles.frowPending}>requested</Text>
                  <Pressable onPress={() => onRemove(f.id)} style={[styles.btn, styles.btnGhost]}>
                    <Text style={[styles.btnText, styles.btnGhostText]}>Cancel</Text>
                  </Pressable>
                </Card>
              ))}
            </Section>
          )}
        </>
      )}
    </ScrollView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  tabs: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  content: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },

  scope: { marginBottom: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, paddingVertical: spacing.md },
  rowMe: { borderColor: colors.primary, borderWidth: 1.5 },
  rank: { width: 20, textAlign: 'center', fontSize: font.body, fontFamily: fonts.display, color: colors.faint },
  rankTop: { color: colors.accent },
  rowBody: { flex: 1 },
  rowName: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  rowSub: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  rowPts: { fontSize: font.heading, fontFamily: fonts.display, color: colors.primary },

  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 4, fontSize: font.body, fontFamily: fonts.body, color: colors.text },

  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: font.small, fontFamily: fonts.bodyBold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted, marginBottom: spacing.sm },
  frow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  frowName: { flex: 1, fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  frowPending: { fontSize: font.tiny, color: colors.faint, fontStyle: 'italic' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnDone: { backgroundColor: colors.primarySoft },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm + 2 },
  btnGhostText: { color: colors.muted },
  more: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.white },
});
