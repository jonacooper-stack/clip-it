import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { CrewAvatar } from './CrewAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useCrewInbox } from '@/lib/crew/useCrewInbox';
import { CREW, type CrewKey } from '../../../shared/crew';
import type { FeedPost } from '@/lib/social';

// A row of crew cards at the top of the feed: something fresh every visit,
// even when nobody else has posted.
export function CrewStrip({ posts }: { posts: FeedPost[] }) {
  const router = useRouter();
  const { items } = useCrewInbox();
  const forecast = items.find((i) => i.kind === 'forecast');
  const regionAsk = items.find((i) => i.kind === 'region');
  const challenges = items.find((i) => i.kind === 'challenges');
  const duel = items.find((i) => i.kind === 'duel')?.duel;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const pick = [...posts]
    .filter((p) => !p.isMine && !p.isBot && p.photoUrl && p.likeCount > 0 && Date.parse(p.createdAt) > weekAgo)
    .sort((a, b) => b.likeCount - a.likeCount)[0];
  const done = challenges?.challenges?.filter((c) => c.done).length ?? 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {forecast ? (
        <Tile crew="scout" label="This week near you" onPress={() => router.push('/crew')}>
          <Text style={styles.big} numberOfLines={2}>{forecast.title}</Text>
          <Text style={styles.small} numberOfLines={2}>{forecast.forecast?.items[0]?.title}</Text>
        </Tile>
      ) : regionAsk ? (
        <Tile crew="scout" label="Weekly forecast" onPress={() => router.push('/region')}>
          <Text style={styles.big} numberOfLines={2}>Where do you explore?</Text>
          <Text style={styles.small}>Pick your region →</Text>
        </Tile>
      ) : null}
      {challenges && (
        <Tile crew="moss" label="This week’s challenges" onPress={() => router.push('/crew')}>
          <Text style={styles.big}>{done} / 3 done</Text>
          <View style={styles.pips}>
            {challenges.challenges?.map((c) => (
              <View key={c.def.id} style={[styles.pip, c.done && { backgroundColor: CREW.moss.color }]} />
            ))}
          </View>
        </Tile>
      )}
      {duel && (
        <Tile crew="kestrel" label="Weekly duel" onPress={() => router.push('/crew')}>
          <Text style={styles.big}>
            You {duel.you} · <Text style={{ color: CREW.kestrel.color }}>Kestrel {duel.kestrel}</Text>
          </Text>
          <Text style={styles.small}>{duel.daysLeft}d left · winner +15</Text>
        </Tile>
      )}
      {pick && (
        <Tile crew="magpie" label="Magpie’s pick" onPress={() => router.push(`/post/${pick.id}`)}>
          <View style={styles.pickRow}>
            <Image source={{ uri: pick.photoUrl! }} style={styles.pickPhoto} contentFit="cover" />
            <Text style={[styles.small, { flex: 1 }]} numberOfLines={3}>
              {pick.displayName}’s {pick.commonName ?? 'sighting'} · ♥ {pick.likeCount}
            </Text>
          </View>
        </Tile>
      )}
    </ScrollView>
  );
}

function Tile({ crew, label, onPress, children }: { crew: CrewKey; label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { borderColor: `${CREW[crew].color}55` }, pressed && { opacity: 0.85 }]}>
      <View style={styles.tileHead}>
        <CrewAvatar crew={crew} size={26} />
        <Text style={[styles.label, { color: CREW[crew].color }]} numberOfLines={1}>{label}</Text>
      </View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  tile: { width: 210, minHeight: 104, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm + 2, gap: 6 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flex: 1, fontSize: font.tiny, fontFamily: fonts.bodyBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  big: { fontSize: font.small + 1, fontFamily: fonts.bodyBold, color: colors.text, lineHeight: 19 },
  small: { fontSize: font.tiny, color: colors.muted, lineHeight: 16 },
  pips: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pip: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt },
  pickRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  pickPhoto: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
});
