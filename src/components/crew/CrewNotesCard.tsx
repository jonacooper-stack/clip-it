import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { CrewAvatar } from './CrewAvatar';
import { CrewBadge } from '@/components/social/CrewBadge';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { fetchCrewNotes } from '@/lib/crew/api';
import { useAuthStore } from '@/state/useAuthStore';
import type { Sighting } from '@/types';
import { withArticle } from '../../../shared/crew';

// Dr. Hoot's field notes + Magpie's finds, on a sighting's detail/result screen.
export function CrewNotesCard({ sighting }: { sighting: Sighting }) {
  const router = useRouter();
  const signedIn = useAuthStore((s) => Boolean(s.session));
  const [loading, setLoading] = useState(false);
  const notes = sighting.crew;
  const eligible = Boolean(sighting.species?.commonName) && sighting.idStatus !== 'rejected' && sighting.idStatus !== 'ineligible' && sighting.idStatus !== 'queued';

  useEffect(() => {
    if (!eligible || notes || !signedIn || sighting.source === 'mock') return;
    setLoading(true);
    fetchCrewNotes(sighting.id).finally(() => setLoading(false));
  }, [eligible, notes, signedIn, sighting.id, sighting.source]);

  if (!eligible || (!notes && !loading)) return null;
  const name = sighting.species?.commonName ?? 'this animal';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.head}>
          <CrewAvatar crew="hoot" size={36} />
          <Text style={styles.name}>Dr. Hoot’s field notes</Text>
          <CrewBadge small />
        </View>
        {loading && !notes ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.dusk} />
            <Text style={styles.muted}>Hoo! Looking up the {name}…</Text>
          </View>
        ) : notes && notes.facts.length ? (
          <>
            {notes.facts.map((f, i) => (
              <View key={i} style={styles.fact}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.factText}>{f}</Text>
              </View>
            ))}
            {!!notes.tip && (
              <View style={styles.tip}>
                <Text style={styles.tipLabel}>Field tip</Text>
                <Text style={styles.factText}>{notes.tip}</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.muted}>Hoo… my notes on the {name} aren’t ready yet. Check back soon!</Text>
        )}
      </View>

      {notes && (notes.others.length > 0 || notes.photo) && (
        <View style={styles.card}>
          <View style={styles.head}>
            <CrewAvatar crew="magpie" size={36} />
            <Text style={styles.name}>{notes.others.length ? `Magpie’s collection: ${name}` : 'From Magpie’s collection'}</Text>
            <CrewBadge small />
          </View>
          {notes.others.length > 0 ? (
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
          ) : notes.photo ? (
            <>
              <Image source={{ uri: notes.photo.url }} style={styles.photo} contentFit="cover" transition={150} />
              <Text style={styles.credit}>Photo: {notes.photo.credit}</Text>
              <Text style={styles.muted}>Nobody’s posted {withArticle(name)} yet. Share yours and it goes straight into my collection!</Text>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginTop: spacing.lg, width: '100%' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.text },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  fact: { flexDirection: 'row', gap: spacing.sm },
  bullet: { fontSize: font.small, color: colors.dusk, lineHeight: 21 },
  factText: { flex: 1, fontSize: font.small, color: colors.text, lineHeight: 21 },
  tip: { backgroundColor: colors.duskSoft, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  tipLabel: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.dusk, textTransform: 'uppercase', letterSpacing: 0.5 },
  others: { gap: spacing.sm },
  other: { width: 132, gap: 4 },
  otherPhoto: { width: 132, height: 100, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  otherName: { fontSize: font.tiny, color: colors.muted },
  photo: { width: '100%', aspectRatio: 1.5, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  credit: { fontSize: 10, color: colors.faint },
});
