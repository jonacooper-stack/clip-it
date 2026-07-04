import { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { Card } from '@/components/Card';
import { WildlifeGallery } from '@/components/WildlifeGallery';
import { colors, spacing, font, fonts } from '@/theme';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import type { Sighting } from '@/types';

export default function Journal() {
  const router = useRouter();
  const sightings = useJournalStore((s) => s.sightings);
  const species = useMemo(() => distinctSpecies(sightings), [sightings]);

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

  const renderItem = ({ item }: { item: Sighting }) => (
    <Pressable style={styles.cell} onPress={() => router.push(`/sighting/${item.id}`)}>
      <Card style={styles.card}>
        {item.photoUri ? (
          <Image source={{ uri: item.photoUri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <SpeciesAvatar scientificName={item.species?.scientificName} size={56} />
        )}
        <Text style={styles.common} numberOfLines={1}>
          {item.species?.commonName}
        </Text>
        <Text style={styles.sci} numberOfLines={1}>
          {item.species?.scientificName}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.count}>×{countFor(item.species?.scientificName)}</Text>
          <Text style={styles.best}>{bestFor(item.species?.scientificName)} pts</Text>
        </View>
      </Card>
    </Pressable>
  );

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
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  title: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: font.body, color: colors.muted, marginTop: 2 },
  row: { gap: spacing.md, marginBottom: spacing.md },
  cell: { flex: 1 },
  card: { alignItems: 'center', paddingVertical: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  common: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  sci: { fontSize: font.tiny, fontStyle: 'italic', color: colors.faint, textAlign: 'center' },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  count: { fontSize: font.tiny, color: colors.muted, fontFamily: fonts.bodyBold },
  best: { fontSize: font.tiny, color: colors.accentInk, fontFamily: fonts.display },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  discover: { marginTop: spacing.lg },
  discoverTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.md },
});
