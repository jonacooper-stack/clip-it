import { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts } from '@/theme';
import { useJournalStore, distinctSpecies } from '@/state/useJournalStore';
import type { Sighting } from '@/types';

export default function Journal() {
  const router = useRouter();
  const sightings = useJournalStore((s) => s.sightings);
  const species = useMemo(() => distinctSpecies(sightings), [sightings]);

  const countFor = (name?: string) =>
    sightings.filter((s) => s.species?.scientificName === name && s.idStatus !== 'rejected').length;
  const bestFor = (name?: string) =>
    sightings
      .filter((s) => s.species?.scientificName === name)
      .reduce((m, s) => Math.max(m, s.points ?? 0), 0);

  const renderItem = ({ item }: { item: Sighting }) => (
    <Pressable style={styles.cell} onPress={() => router.push(`/sighting/${item.id}`)}>
      <Card style={styles.card}>
        <SpeciesAvatar scientificName={item.species?.scientificName} size={56} />
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
            <Text style={styles.emptyEmoji}>📔</Text>
            <Text style={styles.emptyText}>
              Your journal is empty. Every species you photograph gets a page here.
            </Text>
          </Card>
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
  common: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  sci: { fontSize: font.tiny, fontStyle: 'italic', color: colors.faint, textAlign: 'center' },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  count: { fontSize: font.tiny, color: colors.muted, fontFamily: fonts.bodyBold },
  best: { fontSize: font.tiny, color: colors.accentInk, fontFamily: fonts.display },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { fontSize: font.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
