import { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore } from '@/state/useAuthStore';
import { useJournalStore, useJournalSave, distinctSpecies, purgeJournal, setCloudChoice } from '@/state/useJournalStore';
import { askAboutBackup } from '@/lib/backupChoice';
import { askYesNo } from '@/lib/dialogs';
import { playerPoints } from '@/lib/quests';
import { pendingCount, scheduleJournalSync, syncJournal, turnOffBackup, useSyncStatus } from '@/lib/journalSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { uploadAvatar, getMyAvatarUrl, deleteMyAccount } from '@/lib/social';
import { CONTACT_EMAIL } from '@/lib/legal';
import { regionByKey } from '../../shared/crew';
import { saveDiscoverable } from '@/lib/crew/api';
import { useCrewStore } from '@/state/useCrewStore';
import { confirmAction, notify } from '@/lib/dialogs';
import { currentStreak } from '@/lib/streak';
import type { AgeBracket } from '@/types';

const BRACKET_LABEL: Record<AgeBracket, string> = {
  under_13: 'Kid (under 13)',
  '13_17': 'Teen (13–17)',
  adult: 'Adult',
};

export default function Profile() {
  const router = useRouter();
  const displayName = useAppStore((s) => s.displayName);
  const avatarUrl = useAppStore((s) => s.avatarUrl);
  const setAvatarUrl = useAppStore((s) => s.setAvatarUrl);
  const ageBracket = useAppStore((s) => s.ageBracket);
  const saveToCameraRoll = useAppStore((s) => s.saveToCameraRoll);
  const setSaveToCameraRoll = useAppStore((s) => s.setSaveToCameraRoll);
  const showCrew = useAppStore((s) => s.showCrew);
  const setShowCrew = useAppStore((s) => s.setShowCrew);
  const discoverable = useAppStore((s) => s.discoverable ?? s.ageBracket !== '13_17');
  const homeRegion = useAppStore((s) => s.homeRegion);
  const resetApp = useAppStore((s) => s.reset);
  const sightings = useJournalStore((s) => s.sightings);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const email = session?.user?.email;
  const uid = session?.user?.id;
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canEditAvatar = isSupabaseConfigured && !!session;

  const resetCrew = useCrewStore((s) => s.reset);
  // The score is the server's once it keeps this account's journal (it is the
  // number on the leaderboard); until then, what this device adds up to.
  const cloud = useJournalStore((s) => s.cloud);
  const pendingDeletes = useJournalStore((s) => s.pendingDeletes);
  const localPoints = useMemo(() => playerPoints(sightings), [sightings]);
  const points = cloud?.ready && cloud.totals ? cloud.totals.points : localPoints;
  const speciesCount = useMemo(() => distinctSpecies(sightings).length, [sightings]);
  const waiting = useMemo(() => pendingCount(sightings, pendingDeletes), [sightings, pendingDeletes]);
  const syncState = useSyncStatus((s) => s.state);
  const saveFailed = useJournalSave((s) => s.failed);
  const backupLabel =
    saveFailed ? 'Journal: couldn’t save on this phone. Free up some storage'
    :
    cloud?.backup !== true ? 'Journal backup: off. Tap to turn on'
    : syncState === 'syncing' ? 'Journal backup: saving…'
    : waiting > 0 ? `Journal backup: ${waiting} waiting to save`
    : cloud?.ready ? 'Journal backup: up to date'
    : 'Journal backup: not started yet';
  const onBackupRow = () => {
    if (cloud?.backup === true) void syncJournal({ force: true });
    else if (uid) askAboutBackup(uid, { again: true, then: () => void syncJournal({ force: true }) });
  };
  // Stop saving the journal to the account, and offer to delete what is there.
  const onTurnOffBackup = () => {
    askYesNo(
      'Turn off journal backup?',
      'New sightings will stay on this phone only, and your score will stop counting on the leaderboard. You can turn the backup on again at any time.',
      'Turn off',
      'Cancel',
      () =>
        askYesNo(
          'Delete what is saved to your account?',
          'This deletes the copy of your journal that is saved to your account, including the copies of its photos, and resets your score on the leaderboard. The sightings on this phone stay.',
          'Delete it',
          'Keep it',
          () => void turnOffBackup({ erase: true }),
          () => void turnOffBackup({ erase: false }),
        ),
      () => {},
    );
  };
  const streak = useMemo(() => currentStreak(sightings), [sightings]);
  // Sightings in the journal: photos that turned out not to be wildlife (or
  // found no animal) aren't kept there, so they aren't counted here either.
  const sightingCount = useMemo(() => sightings.filter((s) => s.idStatus !== 'rejected' && s.idStatus !== 'ineligible').length, [sightings]);

  // Restore my saved avatar on this device (e.g. after a fresh install / sign-in).
  useEffect(() => {
    if (canEditAvatar) getMyAvatarUrl().then((u) => { if (u) setAvatarUrl(u); });
  }, [canEditAvatar, setAvatarUrl]);

  const pickAvatar = async () => {
    if (!canEditAvatar || uploading) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    const { url, error } = await uploadAvatar(res.assets[0].uri);
    setUploading(false);
    if (url) setAvatarUrl(url);
    else if (error) notify('Couldn’t update photo', 'Please try a different photo, or try again in a moment.');
  };

  const onSignOut = () =>
    confirmAction('Sign out?', 'You can sign back in anytime.', 'Sign out', async () => {
      await signOut();
      resetCrew();
    });

  // App Store Guideline 5.1.1(v): full account deletion from inside the app.
  // Two confirmations, then: delete server data → sign out → wipe local data.
  const onDeleteAccount = () =>
    confirmAction(
      'Delete your account?',
      'This permanently deletes your account, profile, journal, shared posts, photos, comments, likes, follows and friends. It can’t be undone.',
      'Continue',
      () =>
        confirmAction(
          'Are you absolutely sure?',
          'Your account and everything linked to it will be erased now. Your field journal on this device will also be cleared.',
          'Delete forever',
          async () => {
            setDeleting(true);
            const res = await deleteMyAccount();
            if (res.error) {
              console.warn('[delete account]', res.error);
              setDeleting(false);
              notify('Couldn’t delete your account', `Please try again, or email ${CONTACT_EMAIL} and we’ll delete it for you.`);
              return;
            }
            // Erase the journal and its photos from this phone before signing
            // out (after sign-out the journal is no longer loaded).
            await purgeJournal(uid ?? null);
            await signOut();
            resetCrew();
            resetApp();
            setDeleting(false);
            router.replace('/onboarding/welcome');
            notify('Account deleted', 'Your account and data have been permanently deleted.');
          },
        ),
    );

  const onReset = () =>
    confirmAction('Reset app data?', 'This clears your journal and onboarding (for testing).', 'Reset', async () => {
      await purgeJournal(uid ?? null);
      await signOut();
      resetCrew();
      resetApp();
      router.replace('/onboarding/welcome');
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={pickAvatar} disabled={!canEditAvatar || uploading} style={styles.avatarWrap}>
            <UserAvatar name={displayName} uri={avatarUrl} size={88} />
            {canEditAvatar && (
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={14} color={colors.white} />
              </View>
            )}
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.white} />
              </View>
            )}
          </Pressable>
          <Text style={styles.name}>{displayName}</Text>
          {email && <Text style={styles.email}>{email}</Text>}
          {ageBracket && <Text style={styles.bracket}>{BRACKET_LABEL[ageBracket]}</Text>}
        </View>

        <View style={styles.statGrid}>
          <Stat value={points} label="points" />
          <Stat value={speciesCount} label="species" />
          <Stat value={sightingCount} label="sightings" />
          <Stat value={streak} label="day streak" />
        </View>

        <Card style={styles.ethos}>
          <View style={styles.ethosHead}>
            <Ionicons name="leaf" size={18} color={colors.primary} />
            <Text style={styles.ethosTitle}>Observe, don't disturb</Text>
          </View>
          <Text style={styles.ethosText}>
            ClipIt rewards the photo, never the proximity. Keep your distance, leave no trace, and
            let wildlife stay wild.
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.settings}>
          {Platform.OS !== 'web' && (
            <>
              <ToggleRow
                icon="images"
                label="Save photos to camera roll"
                value={saveToCameraRoll}
                onValueChange={setSaveToCameraRoll}
              />
              <Divider />
            </>
          )}
          {isSupabaseConfigured && session && (
            <>
              <Row
                icon="map"
                label={`Home region${homeRegion ? `: ${regionByKey(homeRegion)?.label}` : ''}`}
                onPress={() => router.push('/region')}
              />
              <Divider />
              {/* The journal is kept in the cloud, private to this account. Tap to save now. */}
              <Row icon="cloud-done-outline" label={backupLabel} onPress={onBackupRow} />
              <Divider />
              {cloud?.backup === true && (
                <>
                  {/* On: roughly where each photo was taken (to about a kilometre) is saved with the journal.
                      Off: places stay on this phone, and the ones already saved are removed. */}
                  <ToggleRow
                    icon="location-outline"
                    label="Save places with my journal"
                    value={cloud.places === true}
                    onValueChange={(v) => {
                      setCloudChoice({ places: v });
                      scheduleJournalSync(300);
                    }}
                  />
                  <Divider />
                  <Row icon="cloud-offline-outline" label="Turn off journal backup" onPress={onTurnOffBackup} />
                  <Divider />
                </>
              )}
              <ToggleRow
                icon="sparkles"
                label="Show Scout in my feed"
                value={showCrew}
                onValueChange={setShowCrew}
              />
              <Divider />
              <ToggleRow
                icon="people"
                label="Let Scout suggest me to others"
                value={discoverable}
                onValueChange={(v) => saveDiscoverable(v).catch(() => {})}
              />
              <Divider />
            </>
          )}
          <Row icon="shield-checkmark" label="Privacy policy" onPress={() => router.push('/legal/privacy')} />
          <Divider />
          <Row icon="document-text" label="Terms of use" onPress={() => router.push('/legal/terms')} />
          <Divider />
          <Row icon="help-circle" label="Help & support" onPress={() => router.push('/support')} />
          {isSupabaseConfigured && session && (
            <>
              <Divider />
              <Row icon="person-circle" label="Display name" onPress={() => router.push('/settings/name')} />
              <Divider />
              <Row icon="ban" label="Blocked accounts" onPress={() => router.push('/settings/blocked')} />
              <Divider />
              <Row icon="log-out" label="Sign out" onPress={onSignOut} />
              <Divider />
              <Row
                icon="trash"
                label={deleting ? 'Deleting account…' : 'Delete account'}
                danger
                onPress={deleting ? () => {} : onDeleteAccount}
              />
            </>
          )}
        </Card>

        {__DEV__ && (
          <Pressable onPress={onReset} style={styles.devReset}>
            <Text style={styles.devResetText}>Reset app data (dev)</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function Row({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.muted} />
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  avatarWrap: { width: 88, height: 88, borderRadius: 44 },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(7,11,8,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: font.title, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.sm },
  email: { fontSize: font.small, color: colors.muted, marginTop: 2 },
  bracket: { fontSize: font.small, color: colors.faint, marginTop: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { width: '47.5%', alignItems: 'center', paddingVertical: spacing.md, flexGrow: 1 },
  statValue: { fontSize: font.title, fontFamily: fonts.display, color: colors.primary },
  statLabel: { fontSize: font.tiny, color: colors.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  ethos: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, marginBottom: spacing.lg },
  ethosHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  ethosTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.onPrimary },
  ethosText: { fontSize: font.small, color: colors.onPrimary, lineHeight: 20 },
  sectionTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  settings: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowLabel: { flex: 1, fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 20 + spacing.md },
  devReset: { alignItems: 'center', marginTop: spacing.xl },
  devResetText: { fontSize: font.small, color: colors.faint, textDecorationLine: 'underline' },
});
