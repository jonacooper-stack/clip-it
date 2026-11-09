import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { CrewAvatar } from './CrewAvatar';
import { CrewBadge } from '@/components/social/CrewBadge';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { fetchCrewNotes, NOTES_VERSION } from '@/lib/crew/api';
import { useAuthStore } from '@/state/useAuthStore';
import type { Sighting } from '@/types';
import { withArticle } from '../../../shared/crew';

// Scout's notes on a sighting's detail/result screen: short facts as bullets,
// a spotting tip, other players' photos of the same species, and more
// (credited) photos of it.
export function CrewNotesCard({ sighting }: { sighting: Sighting }) {
  const router = useRouter();
  const signedIn = useAuthStore((s) => Boolean(s.session));
  const [loading, setLoading] = useState(false);
  const notes = sighting.crew;
  const stale = !notes || notes.v !== NOTES_VERSION;
  const eligible = Boolean(sighting.species?.commonName) && sighting.idStatus !== 'rejected' && sighting.idStatus !== 'ineligible' && sighting.idStatus !== 'queued';

  useEffect(() => {
    if (!eligible || !stale || !signedIn || sighting.source === 'mock') return;
    setLoading(true);
    fetchCrewNotes(sighting.id).finally(() => setLoading(false));
  }, [eligible, stale, signedIn, sighting.id, sighting.source]);

  if (!eligible || (!notes && !loading)) return null;
  const name = sighting.species?.commonName ?? 'this animal';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <CrewAvatar size={36} />
        <Text style={styles.name}>Scout’s notes</Text>
        <CrewBadge small />
      </View>
      {loading && !notes ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Looking up the {name}…</Text>
        </View>
      ) : notes && notes.facts.length ? (
        <View style={styles.facts}>
          {notes.facts.map((f, i) => (
            <Text key={i} style={styles.fact}>
              {f}
            </Text>
          ))}
          {!!notes.tip && (
            <View style={styles.tip}>
              <Text style={styles.tipLabel}>How to spot one</Text>
              <Text style={styles.fact}>{notes.tip}</Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.muted}>My notes on the {name} aren’t ready yet. Check back soon!</Text>
      )}

      {notes && notes.others.length > 0 && (
        <>
          <Text style={styles.section}>Other explorers saw one too</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.others}>
            {notes.others.map((o) => (
              <Pressable key={o.postId} onPress={() => router.push(`/post/${o.postId}`)} style={styles.other}>
                <Image source={{ uri: o.photoUrl }} style={styles.otherPhoto} contentFit="cover" />
                <Text style={styles.otherName} numberOfLines={1}>
                  {o.name}
                  {o.likes > 0 ? ` · ♥ ${o.likes}` : ''}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
      {notes && !!notes.photos?.length && (
        <>
          <Text style={styles.section}>More photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.others}>
            {notes.photos.map((p) => (
              <View key={p.url} style={styles.more}>
                <Image source={{ uri: p.url }} style={styles.morePhoto} contentFit="cover" transition={150} />
                <Text style={styles.credit} numberOfLines={1} onPress={() => p.source && Linking.openURL(p.source).catch(() => {})}>
                  📷 {p.credit}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
      {notes && !notes.others.length && (
        <Text style={styles.muted}>Nobody’s posted {withArticle(name)} yet. Share yours to be the first!</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.lg, marginBottom: spacing.md, width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.text },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  facts: { gap: 8 },
  fact: { fontSize: font.body, color: colors.text, lineHeight: 23 },
  tip: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 },
  tipLabel: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.accentInk, textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { marginTop: spacing.xs, fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  others: { gap: spacing.sm },
  other: { width: 132, gap: 4 },
  otherPhoto: { width: 132, height: 100, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  otherName: { fontSize: font.tiny, color: colors.muted },
  more: { width: 200, gap: 4 },
  morePhoto: { width: 200, height: 150, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  credit: { fontSize: 10, color: colors.faint },
});
