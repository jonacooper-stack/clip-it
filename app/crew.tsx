import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CrewAvatar } from '@/components/crew/CrewAvatar';
import { InboxCard } from '@/components/crew/InboxCard';
import { colors, spacing, font, fonts } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useCrewInbox } from '@/lib/crew/useCrewInbox';
import { CREW, CREW_KEYS } from '../shared/crew';

// The Field Crew inbox: forecasts, challenges, duel, facts and finds.
export default function CrewInbox() {
  const router = useRouter();
  const { items } = useCrewInbox();
  const markCrewSeen = useAppStore((s) => s.markCrewSeen);
  // Highlight what was new when the screen opened, then mark it all read.
  const seenAtOpen = useRef(useAppStore.getState().crewSeenAt).current;
  useEffect(() => {
    markCrewSeen();
  }, [markCrewSeen]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/feed'));
  const intro = (key: (typeof CREW_KEYS)[number]) => {
    const m = CREW[key];
    const msg = `${m.role}. ${m.tagline}\n\nThe Field Crew are friendly bots made by the ClipIt team.`;
    if (Platform.OS === 'web') (globalThis as any).alert?.(`${m.name}\n\n${msg}`);
    else Alert.alert(m.name, msg);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Field Crew</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cast}>
          {CREW_KEYS.map((k) => (
            <Pressable key={k} onPress={() => intro(k)} style={styles.member} accessibilityLabel={`${CREW[k].name}, ${CREW[k].role}`}>
              <View style={[styles.ring, { borderColor: CREW[k].color }]}>
                <CrewAvatar crew={k} size={56} />
              </View>
              <Text style={styles.memberName} numberOfLines={1}>{CREW[k].name}</Text>
              <Text style={styles.memberRole} numberOfLines={1}>{CREW[k].role}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.list}>
          {items.map((it) => (
            <InboxCard key={it.id} item={it} unread={it.at > seenAtOpen && it.kind !== 'intro'} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  content: { paddingBottom: spacing.xxl },
  cast: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.md },
  member: { width: 76, alignItems: 'center' },
  ring: { borderWidth: 2, borderRadius: 32, padding: 2 },
  memberName: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 6 },
  memberRole: { fontSize: 10, color: colors.muted, marginTop: 1 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
