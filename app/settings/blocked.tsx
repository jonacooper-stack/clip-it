import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UserAvatar } from '@/components/UserAvatar';
import { Empty } from '@/components/social/parts';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { getBlockedUsers, unblockUser, friendlyError, type BlockedUser } from '@/lib/social';
import { notify } from '@/lib/dialogs';

// Profile → Blocked accounts: see who you've blocked and undo it.
export default function BlockedAccounts() {
  const router = useRouter();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getBlockedUsers().then(setUsers);
  }, []);

  const unblock = async (u: BlockedUser) => {
    setBusyId(u.id);
    const res = await unblockUser(u.id);
    setBusyId(null);
    if (res.error) notify('Couldn’t unblock', friendlyError(res.error));
    else setUsers((us) => (us ? us.filter((x) => x.id !== u.id) : us));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          style={styles.iconBtn}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Blocked accounts</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>
          Blocked people can’t appear in your feed, comments, search or leaderboard. They aren’t told you
          blocked them.
        </Text>
        {users === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : users.length === 0 ? (
          <Empty icon="ban-outline" text="You haven’t blocked anyone." />
        ) : (
          users.map((u) => (
            <View key={u.id} style={styles.row}>
              <UserAvatar name={u.displayName} uri={u.avatarUrl} size={40} />
              <Text style={styles.name} numberOfLines={1}>{u.displayName}</Text>
              <Pressable onPress={() => unblock(u)} disabled={busyId === u.id} style={styles.btn}>
                {busyId === u.id ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.btnText}>Unblock</Text>
                )}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  note: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  name: { flex: 1, fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  btn: {
    minWidth: 90,
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
});
