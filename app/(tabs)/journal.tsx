import { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SightingThumb } from '@/components/SightingThumb';
import { Card } from '@/components/Card';
import { WildlifeGallery } from '@/components/WildlifeGallery';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import type { Sighting } from '@/types';

const GAP = spacing.md;
const PAD = spacing.lg;

export default function Journal() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const sightings = useJournalStore((s) => s.sightings);
  const species = useMemo(() => distinctSpecies(sightings), [sightings]);

  // Two big square tiles per row, Instagram-style.
  const cell = Math.floor((width - PAD * 2 - GAP) / 2);

  const countFor = (name?: string) =>
    sightings.filter(
      (s) =>
        s.species?.scientificName === name &&
        s.idStatus !== 'rejected' &&
        s.idStatus !== 'ineligible',
    ).length;
  const bestFor = (name?: string) =>
    sightings
      .filter((s) => s.species?.scientificName === name)
      .reduce((m, s) => Math.max(m, s.points ?? 0), 0);

  const renderItem = ({ item }: { item: Sighting }) => {
    const count = countFor(item.species?.scientificName);
    return (
      <Pressable style={styles.cell} onPress={() => router.push(`/sighting/${item.id}`)}>
        <View style={[styles.tile, { width: cell, height: cell }]}>
          <SightingThumb
            photoUri={item.photoUri}
            scientificName={item.species?.scientificName}
            size={cell}
            radius={radius.lg}
          />
          {count > 1 && (
            <View style={styles.badge}>
              <Ionicons name="copy" size={11} color={colors.white} />
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
          <View style={styles.overlay}>
            <Text style={styles.tileName} numberOfLines={1}>
              {item.species?.commonName}
            </Text>
            <Text style={styles.tileSci} numberOfLines={1}>
              {bestFor(item.species?.scientificName)} pts
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={species}
        keyExtractor={(s) => s.id}
        numColumns={2}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Field Journal</Text>
            <Text style={styles.subtitle}>
              {species.length} {species.length === 1 ? 'species' : 'species'} collected
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.empty}>
            <Ionicons name="book-outline" size={40} color={colors.faint} style={styles.emptyEmoji} />
            <Text style={styles.emptyText}>
              No species yet. Photograph your first animal and it earns a page here!
            </Text>
          </Card>
        }
        ListFooterComponent={
          <View style={styles.discover}>
            <Text style={styles.discoverTitle}>Out there to discover</Text>
            <WildlifeGallery limit={8} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: PAD, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: 2 },
  row: { gap: GAP, marginBottom: GAP },
  cell: {},
  tile: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(7,11,8,0.55)',
  },
  tileName: { fontSize: font.body, fontFamily: fonts.heading, color: colors.white },
  tileSci: { fontSize: font.tiny, fontFamily: fonts.display, color: colors.accentInk, marginTop: 1 },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(7,11,8,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.white },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  discover: { marginTop: spacing.lg },
  discoverTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.md },
});
