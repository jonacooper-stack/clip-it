import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { getBlockedUsers, unblockUser, type BlockedUser } from '@/lib/moderation';

// Blocking has to be reversible — a one-way block with no way back is both a bad
// experience and something reviewers flag.
export default function BlockedExplorers() {
  const router = useRouter();
  const [rows, setRows] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    getBlockedUsers().then(setRows);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const onUnblock = async (id: string) => {
    setBusyId(id);
    const res = await unblockUser(id);
    setBusyId(null);
    if (!res.error) setRows((rs) => (rs ? rs.filter((r) => r.id !== id) : rs));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Blocked explorers</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          You won't see each other's posts, comments, or profile. Unblocking doesn't restore any
          follow or friendship you had before.
        </Text>

        {rows === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={34} color={colors.faint} />
            <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
          </View>
        ) : (
          rows.map((r) => (
            <Card key={r.id} style={styles.row}>
              <UserAvatar name={r.displayName} uri={r.avatarUrl} size={36} />
              <Text style={styles.name} numberOfLines={1}>{r.displayName}</Text>
              <Pressable onPress={() => onUnblock(r.id)} disabled={busyId === r.id} style={styles.btn}>
                {busyId === r.id ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.btnText}>Unblock</Text>
                )}
              </Pressable>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: font.small, color: colors.muted, lineHeight: 21, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  name: { flex: 1, fontSize: font.small, fontFamily: fonts.bodyMedium, color: colors.text },
  btn: {
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, minWidth: 82, alignItems: 'center',
  },
  btnText: { fontSize: font.tiny, fontFamily: fonts.bodyBold, color: colors.text },
  empty: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  emptyText: { fontSize: font.small, color: colors.faint },
});
