import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Tag } from '@/components/Tag';
import { DisputeBox } from '@/components/DisputeBox';
import { TopoBackground } from '@/components/TopoBackground';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { DemoNotice } from '@/components/DemoNotice';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sighting = useJournalStore((s) => s.sightings.find((x) => x.id === id));

  const scale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);

  const done = () => router.replace('/');

  if (!sighting) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.missing}>Sighting not found.</Text>
      </SafeAreaView>
    );
  }

  if (sighting.idStatus === 'rejected') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.rejected}>
          <Text style={styles.rejEmoji}>🤔</Text>
          <Text style={styles.rejTitle}>No animal spotted</Text>
          <Text style={styles.rejText}>
            We couldn't find a wild animal in that photo. Try getting it clearly in frame.
          </Text>
          <Button label="Try again" icon="camera" onPress={() => router.replace('/capture/camera')} />
          <Button label="Back home" variant="ghost" onPress={done} style={styles.rejBack} />
        </View>
      </SafeAreaView>
    );
  }

  const pending = sighting.idStatus === 'needs_review';
  const confidence = sighting.species?.confidence ?? 0;
  const lowConf = confidence < 0.6;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopoBackground color={colors.primary} opacity={0.05} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {sighting.photoUri && (
          <Image source={{ uri: sighting.photoUri }} style={styles.photo} contentFit="cover" />
        )}

        <Animated.View style={[styles.pointsWrap, { transform: [{ scale }] }]}>
          {pending ? (
            <>
              <Text style={styles.pendingPts}>{sighting.points ?? '—'}</Text>
              <Text style={styles.pendingLabel}>points · pending review</Text>
            </>
          ) : (
            <>
              <Text style={styles.points}>+{sighting.points ?? 0}</Text>
              <Text style={styles.pointsLabel}>POINTS</Text>
            </>
          )}
        </Animated.View>

        {(lowConf || pending) && <Text style={styles.bestGuess}>BEST GUESS</Text>}
        <Text style={styles.common}>{sighting.species?.commonName}</Text>
        <Text style={styles.sci}>{sighting.species?.scientificName}</Text>
        <View style={styles.confidenceWrap}>
          <ConfidenceBadge confidence={confidence} />
        </View>
        {pending && <Text style={styles.reviewNote}>A human will double-check this one.</Text>}

        {sighting.sceneTags.length > 0 && (
          <View style={styles.tags}>
            {sighting.sceneTags.map((t) => (
              <Tag key={t} code={t} />
            ))}
          </View>
        )}

        {sighting.dangerous && (
          <Card style={styles.danger}>
            <Text style={styles.dangerTitle}>⚠️ Keep your distance</Text>
            <Text style={styles.dangerText}>
              This animal can be dangerous. Never approach — a great photo is worth more than a close
              one.
            </Text>
          </Card>
        )}

        {sighting.score && !pending && (
          <Card style={styles.breakdown}>
            <Text style={styles.breakdownTitle}>How you scored</Text>
            <Row label="Base (rarity)" value={`${sighting.score.basePoints}`} />
            {sighting.score.behaviorMultiplier > 1 && (
              <Row label="Behavior bonus" value={`×${sighting.score.behaviorMultiplier}`} />
            )}
            {sighting.score.bonuses.firstOfSpecies > 0 && (
              <Row label="First of species" value={`+${sighting.score.bonuses.firstOfSpecies}`} />
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{sighting.points}</Text>
            </View>
          </Card>
        )}

        {sighting.source === 'mock' && <DemoNotice />}

        <DisputeBox sighting={sighting} />

        <Button label="Add to my journal" icon="checkmark" onPress={done} style={styles.doneBtn} />
      </ScrollView>
    </SafeAreaView>
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
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  missing: { textAlign: 'center', marginTop: spacing.xxl, color: colors.muted },
  photo: { width: '100%', height: 260, borderRadius: radius.lg, marginBottom: spacing.lg },
  pointsWrap: { alignItems: 'center', marginBottom: spacing.md },
  points: { fontSize: 80, fontFamily: fonts.display, color: colors.accent, lineHeight: 84 },
  pointsLabel: { fontSize: font.body, fontFamily: fonts.heading, color: colors.accentInk, letterSpacing: 3 },
  pendingPts: { fontSize: 56, fontFamily: fonts.display, color: colors.muted, lineHeight: 60 },
  pendingLabel: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted },
  common: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, textAlign: 'center' },
  sci: { fontSize: font.body, fontStyle: 'italic', color: colors.faint, textAlign: 'center', marginTop: 2 },
  bestGuess: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.clay, letterSpacing: 1.5, marginBottom: 2, textAlign: 'center' },
  confidenceWrap: { marginTop: spacing.sm },
  reviewNote: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing.sm },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft, marginTop: spacing.lg, width: '100%' },
  dangerTitle: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.danger, marginBottom: spacing.xs },
  dangerText: { fontSize: font.small, color: colors.danger, lineHeight: 20 },
  breakdown: { width: '100%', marginTop: spacing.lg, marginBottom: spacing.md },
  breakdownTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  rowLabel: { fontSize: font.small, color: colors.muted },
  rowValue: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  totalValue: { fontSize: font.heading, fontFamily: fonts.display, color: colors.accent },
  doneBtn: { width: '100%', marginTop: spacing.lg },
  rejected: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  rejEmoji: { fontSize: 56, marginBottom: spacing.md },
  rejTitle: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  rejText: { fontSize: font.body, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  rejBack: { marginTop: spacing.sm },
});
