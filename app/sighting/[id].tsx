import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Tag } from '@/components/Tag';
import { DisputeBox } from '@/components/DisputeBox';
import { SpeciesAvatar } from '@/components/SpeciesAvatar';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { DemoNotice } from '@/components/DemoNotice';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import type { IdStatus } from '@/types';

const STATUS: Record<IdStatus, { label: string; color: string; bg: string }> = {
  identifying: { label: 'Identifying', color: colors.muted, bg: colors.surfaceAlt },
  ai_confident: { label: 'Identified', color: colors.primaryDark, bg: colors.primarySoft },
  needs_review: { label: 'Pending review', color: colors.accentInk, bg: colors.accentSoft },
  human_confirmed: { label: 'Confirmed', color: colors.primaryDark, bg: colors.primarySoft },
  disputed: { label: 'In review', color: colors.accentInk, bg: colors.accentSoft },
  rejected: { label: 'No animal', color: colors.danger, bg: colors.dangerSoft },
};

export default function SightingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sighting = useJournalStore((s) => s.sightings.find((x) => x.id === id));
  const removeSighting = useJournalStore((s) => s.removeSighting);
  const [confirming, setConfirming] = useState(false);

  const onRemove = () => {
    if (id) removeSighting(id);
    router.back();
  };

  if (!sighting) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => router.back()} />
        <Text style={styles.missing}>Sighting not found.</Text>
      </SafeAreaView>
    );
  }

  const status = STATUS[sighting.idStatus];
  const observed = new Date(sighting.observedAt);
  const hasLoc = sighting.lat != null && sighting.lng != null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header onBack={() => router.back()} onDelete={() => setConfirming(true)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {confirming && (
          <Card style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Remove this sighting?</Text>
            <Text style={styles.confirmText}>
              This permanently deletes the photo and its points from your journal.
            </Text>
            <View style={styles.confirmRow}>
              <Button
                label="Cancel"
                variant="ghost"
                size="md"
                onPress={() => setConfirming(false)}
                style={styles.confirmBtn}
              />
              <Button
                label="Remove"
                variant="danger"
                size="md"
                icon="trash"
                onPress={onRemove}
                style={styles.confirmBtn}
              />
            </View>
          </Card>
        )}

        {sighting.photoUri ? (
          <Image source={{ uri: sighting.photoUri }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={styles.photoFallback}>
            <SpeciesAvatar scientificName={sighting.species?.scientificName} size={96} />
          </View>
        )}

        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.common}>{sighting.species?.commonName ?? 'Unidentified'}</Text>
            {sighting.species && <Text style={styles.sci}>{sighting.species.scientificName}</Text>}
          </View>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {sighting.species && (
          <View style={styles.confidenceRow}>
            <ConfidenceBadge confidence={sighting.species.confidence} size="sm" />
          </View>
        )}

        {sighting.caption ? <Text style={styles.caption}>{sighting.caption}</Text> : null}

        {sighting.sceneTags.length > 0 && (
          <View style={styles.tags}>
            {sighting.sceneTags.map((t) => (
              <Tag key={t} code={t} />
            ))}
          </View>
        )}

        {sighting.score && (
          <Card style={styles.block}>
            <Text style={styles.blockTitle}>Score</Text>
            <Row label="Base (rarity)" value={`${sighting.score.basePoints}`} />
            {sighting.score.behaviorMultiplier > 1 && (
              <Row label="Behavior bonus" value={`×${sighting.score.behaviorMultiplier}`} />
            )}
            {sighting.score.bonuses.firstOfSpecies > 0 && (
              <Row label="First of species" value={`+${sighting.score.bonuses.firstOfSpecies}`} />
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{sighting.points} pts</Text>
            </View>
          </Card>
        )}

        <Card style={styles.block}>
          <Text style={styles.blockTitle}>Details</Text>
          <Row label="Spotted" value={observed.toLocaleString()} />
          <Row
            label="Location"
            value={
              hasLoc ? `~${sighting.lat!.toFixed(2)}, ${sighting.lng!.toFixed(2)}` : 'Not recorded'
            }
          />
          {hasLoc && <Text style={styles.privacyNote}>Approximate — your precise location stays private to you.</Text>}
        </Card>

        {sighting.source === 'mock' && <DemoNotice compact />}

        <DisputeBox sighting={sighting} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack, onDelete }: { onBack: () => void; onDelete?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Sighting</Text>
      {onDelete ? (
        <Pressable onPress={onDelete} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </Pressable>
      ) : (
        <View style={styles.backBtn} />
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  missing: { textAlign: 'center', marginTop: spacing.xxl, color: colors.muted },
  photo: { width: '100%', height: 240, borderRadius: radius.lg, marginBottom: spacing.lg },
  photoFallback: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleText: { flex: 1, paddingRight: spacing.md },
  common: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text },
  sci: { fontSize: font.body, fontStyle: 'italic', color: colors.faint, marginTop: 2 },
  confidenceRow: { flexDirection: 'row', marginTop: spacing.md },
  confirmCard: { marginBottom: spacing.lg, backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  confirmTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.danger, marginBottom: spacing.xs },
  confirmText: { fontSize: font.small, color: colors.danger, lineHeight: 20, marginBottom: spacing.md },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmBtn: { flex: 1 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  statusText: { fontSize: font.tiny, fontFamily: fonts.bodyBold },
  caption: { fontSize: font.body, color: colors.muted, marginTop: spacing.sm, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs, marginBottom: spacing.sm },
  block: { marginTop: spacing.lg },
  blockTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  rowLabel: { fontSize: font.small, color: colors.muted },
  rowValue: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  totalValue: { fontSize: font.body, fontFamily: fonts.display, color: colors.accent },
  privacyNote: { fontSize: font.tiny, color: colors.faint, marginTop: spacing.sm, fontStyle: 'italic' },
});
