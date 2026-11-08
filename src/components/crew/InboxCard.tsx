import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CrewAvatar } from './CrewAvatar';
import { CrewBadge } from '@/components/social/CrewBadge';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { CREW } from '../../../shared/crew';
import type { InboxItem } from '@/lib/crew/inbox';
import { resolvePhoto } from '@/lib/photoStore';

const GROUP_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bird: 'bird',
  mammal: 'paw',
  fish: 'fish',
  reptile: 'snake',
  amphibian: 'water',
  insect: 'bug',
  other: 'leaf',
};

function when(at: number): string {
  if (!at) return '';
  const s = Math.max(1, Math.floor((Date.now() - at) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function InboxCard({ item, unread }: { item: InboxItem; unread?: boolean }) {
  const router = useRouter();
  const member = CREW[item.crew];
  return (
    <View style={[styles.card, unread && { borderColor: member.color }]}>
      <View style={styles.head}>
        <CrewAvatar crew={item.crew} size={40} />
        <View style={styles.headText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{member.name}</Text>
            <CrewBadge small />
            {unread && <View style={[styles.dot, { backgroundColor: member.color }]} />}
          </View>
          <Text style={styles.role}>
            {member.role}
            {item.at ? ` · ${when(item.at)}` : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{item.title}</Text>
      {!!item.body && <Text style={styles.body}>{item.body}</Text>}

      {item.forecast && (
        <View style={styles.block}>
          <Text style={styles.body}>{item.forecast.intro}</Text>
          {item.forecast.items.map((f, i) => (
            <View key={i} style={styles.fItem}>
              {f.photo ? (
                <Image source={{ uri: f.photo.url }} style={styles.fPhoto} contentFit="cover" />
              ) : (
                <View style={[styles.fPhoto, styles.fIcon]}>
                  <MaterialCommunityIcons name={GROUP_ICON[f.group] ?? 'leaf'} size={24} color={colors.accentInk} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.fTitle}>{f.title}</Text>
                <Text style={styles.fBody}>{f.body}</Text>
                {!!f.where && (
                  <Text style={styles.fWhere}>
                    <Ionicons name="navigate-outline" size={11} color={colors.faint} /> {f.where}
                  </Text>
                )}
                {!!f.photo && <Text style={styles.credit}>Photo: {f.photo.credit}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      {item.challenges && (
        <View style={styles.block}>
          {item.challenges.map((c) => (
            <View key={c.def.id} style={styles.challenge}>
              <View style={styles.cTop}>
                <Ionicons
                  name={c.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={c.done ? colors.primary : colors.faint}
                />
                <Text style={[styles.cTitle, c.done && styles.cDone]}>{c.def.title}</Text>
                <Text style={styles.cReward}>+{c.def.reward}</Text>
              </View>
              <Text style={styles.cDesc}>{c.def.description}</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round((c.progress / c.def.goal) * 100)}%` }]} />
              </View>
              <Text style={styles.cProg}>
                {c.progress} / {c.def.goal}
              </Text>
            </View>
          ))}
        </View>
      )}

      {item.duel && (item.kind === 'duel' || item.kind === 'kestrel_daily') && (
        <View style={styles.duel}>
          <View style={styles.duelSide}>
            <Text style={styles.duelLabel}>You</Text>
            <Text style={[styles.duelScore, { color: colors.primary }]}>{item.duel.you}</Text>
          </View>
          <Text style={styles.vs}>vs</Text>
          <View style={styles.duelSide}>
            <Text style={styles.duelLabel}>Kestrel</Text>
            <Text style={[styles.duelScore, { color: CREW.kestrel.color }]}>{item.duel.kestrel}</Text>
          </View>
          <Text style={styles.duelDays}>{item.duel.daysLeft}d left</Text>
        </View>
      )}

      {item.others && item.others.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.others}>
          {item.others.map((o) => (
            <Pressable key={o.postId} onPress={() => router.push(`/post/${o.postId}`)} style={styles.other}>
              <Image source={{ uri: o.photoUrl }} style={styles.otherPhoto} contentFit="cover" />
              <Text style={styles.otherName} numberOfLines={1}>
                {o.name}
                {o.likes > 0 ? ` · ♥ ${o.likes}` : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {!!item.photoUri && (
        <View style={styles.block}>
          <Image source={{ uri: resolvePhoto(item.photoUri) ?? item.photoUri }} style={styles.photo} contentFit="cover" transition={150} />
          {!!item.photoCredit && <Text style={styles.credit}>Photo: {item.photoCredit}</Text>}
        </View>
      )}

      {!!item.href && !!item.cta && (
        <Pressable onPress={() => router.push(item.href as any)} style={[styles.cta, { borderColor: member.color }]}>
          <Text style={[styles.ctaText, { color: member.color }]}>{item.cta}</Text>
          <Ionicons name="arrow-forward" size={15} color={member.color} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  headText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },
  role: { fontSize: font.tiny, color: colors.muted, marginTop: 1 },
  title: { fontSize: font.body + 1, fontFamily: fonts.heading, color: colors.text, lineHeight: 22 },
  body: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  block: { gap: spacing.sm, marginTop: spacing.xs },
  fItem: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  fPhoto: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  fIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  fTitle: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  fBody: { fontSize: font.small, color: colors.muted, lineHeight: 19, marginTop: 2 },
  fWhere: { fontSize: font.tiny, color: colors.faint, marginTop: 3 },
  credit: { fontSize: 10, color: colors.faint, marginTop: 2 },
  challenge: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  cTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cTitle: { flex: 1, fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  cDone: { color: colors.primary },
  cReward: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.accentInk },
  cDesc: { fontSize: font.tiny, color: colors.muted, marginLeft: 24 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginLeft: 24 },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  cProg: { fontSize: 10, color: colors.faint, marginLeft: 24 },
  duel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  duelSide: { alignItems: 'center', minWidth: 64 },
  duelLabel: { fontSize: font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  duelScore: { fontSize: font.title, fontFamily: fonts.display },
  vs: { fontSize: font.small, color: colors.faint },
  duelDays: { flex: 1, textAlign: 'right', fontSize: font.tiny, color: colors.muted },
  others: { gap: spacing.sm, marginTop: spacing.xs },
  other: { width: 120, gap: 4 },
  otherPhoto: { width: 120, height: 90, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  otherName: { fontSize: font.tiny, color: colors.muted },
  photo: { width: '100%', aspectRatio: 1.5, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  cta: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  ctaText: { fontSize: font.small, fontFamily: fonts.bodyBold },
});
