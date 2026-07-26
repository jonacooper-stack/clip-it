import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SightingThumb } from '@/components/SightingThumb';
import { Card } from '@/components/Card';
import { WildlifeGallery } from '@/components/WildlifeGallery';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { sceneTagMeta } from '@/lib/sceneTags';
import type { Sighting } from '@/types';

const PAD = spacing.md;
const GAP = 4;
const COLS = 3;

type GroupKey = 'all' | 'species' | 'date' | 'location';
const GROUPS: { key: GroupKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'grid' },
  { key: 'species', label: 'Species', icon: 'paw' },
  { key: 'date', label: 'Date', icon: 'calendar' },
  { key: 'location', label: 'Location', icon: 'location' },
];

const webInputReset: any =
  Platform.OS === 'web' ? { outlineStyle: 'none', borderWidth: 0, backgroundColor: 'transparent' } : null;

// Words that are noise in a free-text spot search ("the picture of…").
const STOP = new Set([
  'the', 'and', 'with', 'for', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'my', 'me', 'it',
  'is', 'was', 'are', 'this', 'that', 'these', 'those', 'photo', 'photos', 'picture',
  'pictures', 'pic', 'pics', 'image', 'images',
]);

function queryTokens(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
}

// Everything searchable about a sighting, lower-cased.
function haystack(s: Sighting): string {
  const tags = (s.sceneTags ?? []).map((c) => sceneTagMeta(c)?.label ?? c);
  const notes = Object.values(s.science ?? {}).flat();
  return [s.species?.commonName, s.species?.scientificName, s.caption, ...tags, ...notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreMatch(hay: string, tokens: string[]): number {
  let n = 0;
  for (const t of tokens) if (hay.includes(t)) n++;
  return n;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayTitle(ms: number): string {
  const key = dayKey(ms);
  const now = Date.now();
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(now - 86400000)) return 'Yesterday';
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
function locKey(s: Sighting): string {
  return s.lat != null && s.lng != null ? `${s.lat.toFixed(2)},${s.lng.toFixed(2)}` : 'none';
}

interface Group { key: string; title?: string; items: Sighting[] }
type Row =
  | { type: 'header'; key: string; title: string; count: number }
  | { type: 'photos'; key: string; items: Sighting[] };

function buildGroups(items: Sighting[], group: GroupKey): Group[] {
  if (group === 'all') return [{ key: 'all', items }];
  const map = new Map<string, Group>();
  for (const s of items) {
    let key: string;
    let title: string;
    if (group === 'species') {
      key = s.species?.scientificName ?? 'unidentified';
      title = s.species?.commonName ?? 'Identifying…';
    } else if (group === 'date') {
      key = dayKey(s.observedAt);
      title = dayTitle(s.observedAt);
    } else {
      key = locKey(s);
      title = key === 'none' ? 'No location' : `~${s.lat!.toFixed(2)}, ${s.lng!.toFixed(2)}`;
    }
    if (!map.has(key)) map.set(key, { key, title, items: [] });
    map.get(key)!.items.push(s);
  }
  const groups = [...map.values()];
  if (group === 'date') {
    groups.sort((a, b) => b.items[0].observedAt - a.items[0].observedAt);
  } else {
    // Biggest groups first; "no location" / "unidentified" sink to the bottom.
    const sink = (g: Group) => g.key === 'none' || g.key === 'unidentified';
    groups.sort((a, b) => (sink(a) ? 1 : 0) - (sink(b) ? 1 : 0) || b.items.length - a.items.length);
  }
  return groups;
}

function buildRows(items: Sighting[], group: GroupKey): Row[] {
  const rows: Row[] = [];
  for (const g of buildGroups(items, group)) {
    if (g.title) rows.push({ type: 'header', key: `h:${g.key}`, title: g.title, count: g.items.length });
    for (let i = 0; i < g.items.length; i += COLS) {
      rows.push({ type: 'photos', key: `p:${g.key}:${i}`, items: g.items.slice(i, i + COLS) });
    }
  }
  return rows;
}

export default function Journal() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const sightings = useJournalStore((s) => s.sightings);
  const [group, setGroup] = useState<GroupKey>('all');
  const [query, setQuery] = useState('');

  const tile = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);

  // Every real capture (photo and/or species), excluding non-animals.
  const base = useMemo(
    () =>
      sightings.filter(
        (s) => (s.photoUri || s.species) && s.idStatus !== 'rejected' && s.idStatus !== 'ineligible',
      ),
    [sightings],
  );

  const tokens = useMemo(() => queryTokens(query), [query]);
  const filtered = useMemo(() => {
    if (!tokens.length) return base;
    return base
      .map((s) => ({ s, score: scoreMatch(haystack(s), tokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.s.observedAt - a.s.observedAt)
      .map((x) => x.s);
  }, [base, tokens]);

  const rows = useMemo(() => buildRows(filtered, group), [filtered, group]);
  const searching = tokens.length > 0;

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.type === 'header') {
      return (
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle} numberOfLines={1}>{row.title}</Text>
          <Text style={styles.groupCount}>{row.count}</Text>
        </View>
      );
    }
    return (
      <View style={styles.photoRow}>
        {row.items.map((s) => (
          <Pressable key={s.id} onPress={() => router.push(`/sighting/${s.id}`)}>
            <SightingThumb photoUri={s.photoUri} scientificName={s.species?.scientificName} size={tile} radius={radius.sm} />
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Field Journal</Text>
        <Text style={styles.subtitle}>
          {filtered.length} {filtered.length === 1 ? 'photo' : 'photos'}
          {searching ? ` matching “${query.trim()}”` : ''}
        </Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search spots — species, caption, notes…"
            placeholderTextColor={colors.faint}
            style={[styles.searchInput, webInputReset]}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          )}
        </View>

        <View style={styles.chips}>
          {GROUPS.map((g) => {
            const on = g.key === group;
            return (
              <Pressable key={g.key} onPress={() => setGroup(g.key)} style={[styles.chip, on && styles.chipOn]}>
                <Ionicons name={g.icon} size={13} color={on ? colors.white : colors.muted} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          base.length === 0 ? (
            <Card style={styles.empty}>
              <Ionicons name="images-outline" size={40} color={colors.faint} style={styles.emptyIcon} />
              <Text style={styles.emptyText}>
                No photos yet. Tap the camera to ClipIt your first sighting — every shot lands here.
              </Text>
            </Card>
          ) : (
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={34} color={colors.faint} />
              <Text style={styles.emptyText}>No spots match “{query.trim()}”. Try a species, place, or caption word.</Text>
            </View>
          )
        }
        ListFooterComponent={
          group === 'all' && !searching && filtered.length > 0 ? (
            <View style={styles.discover}>
              <Text style={styles.discoverTitle}>Out there to discover</Text>
              <WildlifeGallery limit={8} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: PAD, paddingTop: spacing.sm },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.small, color: colors.muted, marginTop: 2 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 3, fontSize: font.body, fontFamily: fonts.body, color: colors.text },

  chips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted },
  chipTextOn: { color: colors.white },

  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xs },
  photoRow: { flexDirection: 'row', gap: GAP, paddingHorizontal: PAD, marginBottom: GAP },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  groupTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, flex: 1 },
  groupCount: {
    fontSize: font.tiny,
    fontFamily: fonts.bodyBold,
    color: colors.muted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xl, marginHorizontal: PAD, marginTop: spacing.lg },
  emptyIcon: { marginBottom: spacing.sm },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  noResults: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },

  discover: { marginTop: spacing.xl, paddingHorizontal: PAD },
  discoverTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.md },
});
