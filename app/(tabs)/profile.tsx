import { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Card } from '@/components/Card';
import { UserAvatar } from '@/components/UserAvatar';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { useAuthStore } from '@/state/useAuthStore';
import { useJournalStore, totalPoints, distinctSpecies } from '@/state/useJournalStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { uploadAvatar, getMyAvatarUrl } from '@/lib/social';
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
  const streak = useAppStore((s) => s.streakCount);
  const saveToCameraRoll = useAppStore((s) => s.saveToCameraRoll);
  const setSaveToCameraRoll = useAppStore((s) => s.setSaveToCameraRoll);
  const resetApp = useAppStore((s) => s.reset);
  const sightings = useJournalStore((s) => s.sightings);
  const resetJournal = useJournalStore((s) => s.reset);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const email = session?.user?.email;
  const [uploading, setUploading] = useState(false);
  const canEditAvatar = isSupabaseConfigured && !!session;

  const points = useMemo(() => totalPoints(sightings), [sightings]);
  const speciesCount = useMemo(() => distinctSpecies(sightings).length, [sightings]);

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
    else if (error) Alert.alert('Couldn’t update photo', error);
  };

  const soon = (label: string) => Alert.alert(label, 'Coming in a later phase.');

  const onSignOut = () =>
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  const onReset = () =>
    Alert.alert('Reset app data?', 'This clears your journal and onboarding (for testing).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          resetJournal();
          resetApp();
          router.replace('/onboarding/welcome');
        },
      },
    ]);

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
          <Stat value={sightings.length} label="sightings" />
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
          <Row icon="lock-closed" label="Privacy & location" onPress={() => soon('Privacy & location')} />
          <Divider />
          <Row icon="people" label="Manage child profile" onPress={() => soon('Child profiles')} />
          <Divider />
          <Row icon="trash" label="Delete account" danger onPress={() => soon('Delete account')} />
          {isSupabaseConfigured && session && (
            <>
              <Divider />
              <Row icon="log-out" label="Sign out" onPress={onSignOut} />
            </>
          )}
        </Card>

        <Pressable onPress={onReset} style={styles.devReset}>
          <Text style={styles.devResetText}>Reset app data (dev)</Text>
        </Pressable>
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
