import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Easing, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Tag } from '@/components/Tag';
import { DisputeBox } from '@/components/DisputeBox';
import { TopoBackground } from '@/components/TopoBackground';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { DemoNotice } from '@/components/DemoNotice';
import { CrewNotesCard } from '@/components/crew/CrewNotesCard';
import { ScienceQuestions } from '@/components/ScienceQuestions';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useJournalStore } from '@/state/useJournalStore';
import { applyFieldNotesBonus } from '@/lib/scoring';
import { questionsForSighting, coerceScience, SCIENCE_QUESTIONS } from '@/lib/scienceQuestions';
import { resolvePhoto } from '@/lib/photoStore';
import { groupOf } from '@/lib/quests';
import { useQuestSightings } from '@/lib/useQuestSightings';
import { challengeStatus } from '@/lib/crew/challenges';
import { crewSeed } from '@/lib/crew/seed';
import { startOfWeek } from '@/lib/crew/time';
import { currentStreak } from '@/lib/streak';

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sighting = useJournalStore((s) => s.sightings.find((x) => x.id === id));
  const removeSighting = useJournalStore((s) => s.removeSighting);
  const editSighting = useJournalStore((s) => s.editSighting);
  const [confirming, setConfirming] = useState(false);

  const scale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);

  // The points count up once, when the result first appears. Later changes
  // (field notes add a point each) just show the new total.
  const target = sighting?.points ?? 0;
  const [shownPoints, setShownPoints] = useState(0);
  const countedUp = useRef(false);
  useEffect(() => {
    if (countedUp.current || target <= 0) {
      setShownPoints(target);
      return;
    }
    countedUp.current = true;
    const value = new Animated.Value(0);
    const sub = value.addListener((v) => setShownPoints(Math.round(v.value)));
    Animated.timing(value, {
      toValue: target,
      duration: Math.min(1000, 350 + target * 40),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // drives a number in state, not a native style
    }).start(() => setShownPoints(target));
    return () => value.removeListener(sub);
  }, [target]);

  // What this sighting moved forward: this week's quests it counted toward,
  // and the day streak. (The reason to head out again tomorrow.)
  const sightings = useJournalStore((s) => s.sightings);
  const counted = useQuestSightings(); // the journal as quests count it
  const progress = useMemo(() => {
    if (!sighting || typeof sighting.points !== 'number') return null;
    const week = startOfWeek(Date.now());
    const seed = crewSeed();
    // (Not in the list: it counts for nothing. Its date there is the week it counts in.)
    const mine = counted.find((x) => x.id === sighting.id);
    const quests =
      mine && startOfWeek(mine.observedAt) === week
        ? (() => {
            const before = challengeStatus(week, counted.filter((x) => x.id !== sighting.id), seed, groupOf);
            return challengeStatus(week, counted, seed, groupOf).filter((c, i) => c.progress > before[i].progress);
          })()
        : [];
    return { quests, streak: currentStreak(sightings) };
  }, [sighting, sightings, counted]);

  const done = () => router.replace('/feed');
  const discard = () => {
    if (id) removeSighting(id);
    router.replace('/feed');
  };
  // Rejected / ineligible sightings aren't kept in the journal, so drop the record
  // on the way out instead of letting photos pile up in storage.
  const retry = () => {
    if (id) removeSighting(id);
    router.replace('/capture/camera');
  };

  // Record (or toggle off) a science answer and re-apply the bonus to the score.
  const onAnswer = (qid: string, value: string) => {
    if (!sighting) return;
    const multi = SCIENCE_QUESTIONS.find((q) => q.id === qid)?.multi ?? false;
    const next = coerceScience(sighting.science);
    const current = next[qid] ?? [];
    let updated: string[];
    if (current.includes(value)) updated = current.filter((v) => v !== value); // toggle off
    else if (multi) updated = [...current, value]; // add another
    else updated = [value]; // single-select: replace
    if (updated.length) next[qid] = updated;
    else delete next[qid];
    const answered = Object.keys(next).length;
    // The bonus point per answer is for sightings the server identified. One
    // it holds only on this phone's word keeps the points it has.
    const phoneScoredInCloud = Boolean(sighting.cloudAt) && sighting.verified === false;
    if (sighting.score && !phoneScoredInCloud) {
      // Shown at once with the same rule the server uses; the server
      // confirms the bonus when the answers reach it.
      const { score, points } = applyFieldNotesBonus(sighting.score, answered);
      editSighting(sighting.id, { science: next, score, points });
    } else {
      editSighting(sighting.id, { science: next });
    }
  };

  if (!sighting) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.replace('/feed')}
            style={styles.closeBtn}
            hitSlop={8}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.missing}>Sighting not found.</Text>
      </SafeAreaView>
    );
  }

  const photoSrc = resolvePhoto(sighting.photoUri);

  if (sighting.idStatus === 'rejected') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.rejected}>
          <Ionicons name="help-circle-outline" size={54} color={colors.faint} style={styles.rejEmoji} />
          <Text style={styles.rejTitle}>{sighting.note ? 'Couldn’t identify this one' : 'Nothing to identify'}</Text>
          <Text style={styles.rejText}>
            {sighting.note ||
              'We couldn’t find an animal or person in that photo. Try getting your subject clearly in frame.'}
          </Text>
          <Button label="Try again" icon="camera" onPress={retry} />
          <Button label="Back home" variant="ghost" onPress={discard} style={styles.rejBack} />
        </View>
      </SafeAreaView>
    );
  }

  // Identified, but not a wild animal (a pet or a person). Show the ID so the player
  // sees the identifier works, and explain why it doesn't score.
  if (sighting.idStatus === 'ineligible') {
    const confidence = sighting.species?.confidence ?? 0;
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopoBackground color={colors.primary} opacity={0.05} />
        <View style={styles.topBar}>
          <Pressable onPress={discard} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {photoSrc && (
            <Image source={{ uri: photoSrc }} style={styles.photo} contentFit="cover" />
          )}
          <Text style={styles.bestGuess}>NOT ELIGIBLE</Text>
          <Text style={styles.common}>{sighting.species?.commonName ?? 'Unknown'}</Text>
          {sighting.species?.scientificName ? (
            <Text style={styles.sci}>{sighting.species.scientificName}</Text>
          ) : null}
          <View style={styles.confidenceWrap}>
            <ConfidenceBadge confidence={confidence} />
          </View>
          <Card style={styles.ineligibleCard}>
            <Text style={styles.ineligibleText}>
              {sighting.ineligibleReason || "Only wild animals earn points — this one doesn't count."}
            </Text>
            <Text style={styles.ineligibleSub}>
              The identifier is working — it just doesn't score toward your collection.
            </Text>
          </Card>
          {sighting.source === 'mock' && <DemoNotice reason={sighting.note} />}
          <Button label="Try again" icon="camera" onPress={retry} style={styles.doneBtn} />
          <Button label="Back home" variant="ghost" onPress={discard} style={styles.rejBack} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Captured offline — no AI yet. Reassure the player it's saved and will score
  // itself once they're back online.
  if (sighting.idStatus === 'queued') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TopoBackground color={colors.primary} opacity={0.05} />
        <View style={styles.topBar}>
          <Pressable onPress={done} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {photoSrc && (
            <Image source={{ uri: photoSrc }} style={styles.photo} contentFit="cover" />
          )}
          <Ionicons name="cloud-offline-outline" size={48} color={colors.accentInk} style={styles.rejEmoji} />
          <Text style={styles.common}>Photo captured</Text>
          <Card style={styles.queuedCard}>
            <Text style={styles.queuedText}>
              We couldn’t reach the identifier just now, so it’s saved with the time and place you took
              it. ClipIt will identify it and award points automatically in the background. No need to
              do anything.
            </Text>
          </Card>
          <Button label="Got it" icon="checkmark" onPress={done} style={styles.doneBtn} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const pending = sighting.idStatus === 'needs_review';
  const confidence = sighting.species?.confidence ?? 0;
  const lowConf = confidence < 0.6;
  const repeatMult = sighting.score?.repeatMultiplier;
  const capped = sighting.score?.dailyCap; // enough of these for today (a daily limit, not the photo)
  const duplicate = repeatMult === 0 && !capped; // exact photo already submitted
  const repeated = repeatMult != null && repeatMult > 0 && repeatMult < 1; // same species again

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopoBackground color={colors.primary} opacity={0.05} />
      <View style={styles.topBar}>
        <Pressable onPress={() => setConfirming(true)} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {confirming && (
          <Card style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Discard this sighting?</Text>
            <Text style={styles.confirmText}>It won’t be saved to your journal.</Text>
            <View style={styles.confirmRow}>
              <Button
                label="Cancel"
                variant="ghost"
                size="md"
                onPress={() => setConfirming(false)}
                style={styles.confirmBtn}
              />
              <Button
                label="Discard"
                variant="danger"
                size="md"
                icon="trash"
                onPress={discard}
                style={styles.confirmBtn}
              />
            </View>
          </Card>
        )}

        {photoSrc && (
          <Image source={{ uri: photoSrc }} style={styles.photo} contentFit="cover" />
        )}

        <Animated.View style={[styles.pointsWrap, { transform: [{ scale }] }]}>
          {pending ? (
            <>
              <Text style={styles.pendingPts}>{sighting.points ?? '—'}</Text>
              <Text style={styles.pendingLabel}>points · pending review</Text>
            </>
          ) : (
            <>
              <Text style={styles.points} accessibilityLabel={`${sighting.points ?? 0} points`}>+{shownPoints}</Text>
              <Text style={styles.pointsLabel}>POINTS</Text>
            </>
          )}
        </Animated.View>

        {(sighting.score?.bonuses.firstOfSpecies ?? 0) > 0 && (
          <View style={styles.newPill}>
            <Ionicons name="sparkles" size={13} color={colors.accentInk} />
            <Text style={styles.newPillText}>New species for your journal</Text>
          </View>
        )}
        {(lowConf || pending) && <Text style={styles.bestGuess}>BEST GUESS</Text>}
        <Text style={styles.common}>{sighting.species?.commonName}</Text>
        <Text style={styles.sci}>{sighting.species?.scientificName}</Text>
        <View style={styles.confidenceWrap}>
          <ConfidenceBadge confidence={confidence} />
        </View>
        {pending && <Text style={styles.reviewNote}>A human will double-check this one.</Text>}

        {duplicate && (
          <Card style={styles.duplicateCard}>
            <View style={styles.duplicateHead}>
              <Ionicons name="copy-outline" size={18} color={colors.accentInk} />
              <Text style={styles.duplicateTitle}>Already in your journal</Text>
            </View>
            <Text style={styles.duplicateText}>
              You’ve submitted this exact photo before, so it doesn’t earn points again. Snap a fresh
              shot to score.
            </Text>
          </Card>
        )}
        {capped && (
          <Card style={styles.duplicateCard}>
            <View style={styles.duplicateHead}>
              <Ionicons name="time-outline" size={18} color={colors.accentInk} />
              <Text style={styles.duplicateTitle}>Enough for today</Text>
            </View>
            <Text style={styles.duplicateText}>
              {capped === 'species'
                ? 'You’ve logged plenty of this species today, so this one is in your journal without points. It counts again from tomorrow.'
                : 'You’ve logged lots of repeat sightings today, so this one is in your journal without points. Repeats count again from tomorrow, and new species always count.'}
            </Text>
          </Card>
        )}
        {repeated && (
          <Text style={styles.repeatNote}>
            You’ve photographed this species before — repeat sightings earn reduced points.
          </Text>
        )}

        {sighting.sceneTags.length > 0 && (
          <View style={styles.tags}>
            {sighting.sceneTags.map((t) => (
              <Tag key={t} code={t} />
            ))}
          </View>
        )}

        {sighting.dangerous && (
          <Card style={styles.danger}>
            <View style={styles.dangerHead}>
              <Ionicons name="warning" size={18} color={colors.danger} />
              <Text style={styles.dangerTitle}>Keep your distance</Text>
            </View>
            <Text style={styles.dangerText}>
              This animal can be dangerous. Never approach: use zoom and stay well back. Behavior bonuses
              don’t apply to dangerous animals, so getting closer never earns more.
            </Text>
          </Card>
        )}

        {sighting.score && !pending && !duplicate && (
          <Card style={styles.breakdown}>
            <Text style={styles.breakdownTitle}>How you scored</Text>
            <Row label="Base (rarity)" value={`${sighting.score.basePoints}`} />
            {sighting.score.behaviorMultiplier > 1 && (
              <Row label="Behavior bonus" value={`×${sighting.score.behaviorMultiplier}`} />
            )}
            {repeated && (
              <Row label="Repeat sighting" value={`×${repeatMult!.toFixed(2)}`} />
            )}
            {sighting.score.bonuses.firstOfSpecies > 0 && (
              <Row label="First of species" value={`+${sighting.score.bonuses.firstOfSpecies}`} />
            )}
            {(sighting.score.bonuses.fieldNotes ?? 0) > 0 && (
              <Row label="Field notes" value={`+${sighting.score.bonuses.fieldNotes}`} />
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{sighting.points}</Text>
            </View>
          </Card>
        )}

        {progress && (progress.quests.length > 0 || progress.streak > 0) && (
          <Card style={styles.progress}>
            {progress.quests.map((c) => (
              <View key={c.def.id} style={styles.progressRow}>
                <Text style={styles.progressEmoji}>{c.def.emoji}</Text>
                <Text style={styles.progressText} numberOfLines={2}>
                  {c.done ? `Quest complete: ${c.def.title}` : `${c.def.title}: ${c.progress} of ${c.def.goal}`}
                </Text>
                <Text style={styles.progressGain}>{c.done ? `+${c.def.reward}` : ''}</Text>
              </View>
            ))}
            {progress.streak > 0 && (
              <View style={styles.progressRow}>
                <Ionicons name="flame" size={16} color={colors.accent} style={styles.progressIcon} />
                <Text style={styles.progressText}>
                  {progress.streak === 1 ? 'Day 1 of a new streak. Spot something tomorrow to keep it going.' : `${progress.streak} day streak. Spot something tomorrow to keep it going.`}
                </Text>
              </View>
            )}
          </Card>
        )}

        {sighting.species && (
          <ScienceQuestions
            questions={questionsForSighting(sighting.id)}
            answers={sighting.science ?? {}}
            onAnswer={onAnswer}
          />
        )}

        {sighting.source === 'mock' && <DemoNotice reason={sighting.note} />}

        <CrewNotesCard sighting={sighting} />

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
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  confirmCard: { width: '100%', marginBottom: spacing.lg, backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  confirmTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.danger, marginBottom: spacing.xs },
  confirmText: { fontSize: font.small, color: colors.danger, lineHeight: 20, marginBottom: spacing.md },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmBtn: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  missing: { textAlign: 'center', marginTop: spacing.xxl, color: colors.muted },
  photo: { width: '100%', height: 260, borderRadius: radius.lg, marginBottom: spacing.lg },
  pointsWrap: { alignItems: 'center', marginBottom: spacing.md },
  points: { fontSize: 80, fontFamily: fonts.display, color: colors.accent, lineHeight: 84 },
  pointsLabel: { fontSize: font.body, fontFamily: fonts.heading, color: colors.accentInk, letterSpacing: 3 },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, marginBottom: spacing.sm },
  newPillText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.accentInk },
  progress: { width: '100%', marginTop: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressEmoji: { fontSize: 16, width: 22, textAlign: 'center' },
  progressIcon: { width: 22, textAlign: 'center' },
  progressText: { flex: 1, fontSize: font.small, color: colors.text, lineHeight: 20 },
  progressGain: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.accentInk },
  pendingPts: { fontSize: 56, fontFamily: fonts.display, color: colors.muted, lineHeight: 60 },
  pendingLabel: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.muted },
  common: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, textAlign: 'center' },
  sci: { fontSize: font.body, fontStyle: 'italic', color: colors.faint, textAlign: 'center', marginTop: 2 },
  bestGuess: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.clay, letterSpacing: 1.5, marginBottom: 2, textAlign: 'center' },
  confidenceWrap: { marginTop: spacing.sm },
  reviewNote: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing.sm },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft, marginTop: spacing.lg, width: '100%' },
  dangerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  dangerTitle: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.danger },
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
  ineligibleCard: {
    width: '100%',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.claySoft,
    borderColor: colors.claySoft,
  },
  ineligibleText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.clay, lineHeight: 22 },
  ineligibleSub: { fontSize: font.small, color: colors.text, opacity: 0.7, marginTop: spacing.xs, lineHeight: 20 },
  queuedCard: {
    width: '100%',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  queuedText: { fontSize: font.body, color: colors.accentInk, lineHeight: 22, textAlign: 'center' },
  duplicateCard: {
    width: '100%',
    marginTop: spacing.md,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  duplicateHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  duplicateTitle: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.accentInk },
  duplicateText: { fontSize: font.small, color: colors.accentInk, lineHeight: 20 },
  repeatNote: { fontSize: font.small, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
});
