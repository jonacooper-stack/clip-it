import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { useAppStore } from '@/state/useAppStore';
import { CONTACT_EMAIL } from '@/lib/contact';

// Privacy & location. Deliberately explanatory rather than a wall of switches:
// the honest answer for most of this is "it never leaves your phone", and
// inventing toggles that don't control anything would be worse than saying so.
export default function PrivacySettings() {
  const router = useRouter();
  const saveToCameraRoll = useAppStore((s) => s.saveToCameraRoll);
  const setSaveToCameraRoll = useAppStore((s) => s.setSaveToCameraRoll);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const openSystemSettings = () => {
    if (Platform.OS === 'web') return;
    Linking.openSettings().catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & location</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <View style={styles.heroHead}>
            <Ionicons name="location" size={18} color={colors.primary} />
            <Text style={styles.heroTitle}>Your spots stay yours</Text>
          </View>
          <Text style={styles.heroText}>
            The exact coordinates of every sighting are stored on this phone and nowhere else. They
            are never attached to anything you share, and no other explorer can see where you were.
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>What leaves your phone</Text>
        <Card style={styles.card}>
          <Fact icon="sparkles" title="The photo, to identify the animal">
            When you capture a sighting, the image is sent to our identification service. Your
            location, your name, and your account aren't sent with it.
          </Fact>
          <Divider />
          <Fact icon="share-social" title="Only what you tap Share on">
            Sharing a sighting uploads the photo, species, points, and your caption to the community
            wall. We strip the image's embedded GPS metadata first.
          </Fact>
          <Divider />
          <Fact icon="phone-portrait" title="Nothing else">
            Your field journal, your unshared photos, and every precise coordinate stay on the
            device. Delete the app and they're gone.
          </Fact>
        </Card>

        <Text style={styles.sectionTitle}>Controls</Text>
        <Card style={styles.settings}>
          {Platform.OS !== 'web' && (
            <>
              <View style={styles.row}>
                <Ionicons name="images" size={20} color={colors.muted} />
                <Text style={styles.rowLabel}>Save photos to camera roll</Text>
                <Switch
                  value={saveToCameraRoll}
                  onValueChange={setSaveToCameraRoll}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.border}
                />
              </View>
              <Divider />
            </>
          )}
          <Row icon="ban" label="Blocked explorers" onPress={() => router.push('/settings/blocked')} />
          <Divider />
          <Row icon="document-text" label="Privacy policy" onPress={() => router.push('/legal/privacy')} />
          {Platform.OS !== 'web' && (
            <>
              <Divider />
              <Row icon="settings" label="App permissions" onPress={openSystemSettings} />
            </>
          )}
        </Card>

        <Text style={styles.footnote}>
          Camera, location, and photo-library access can each be turned off in your device settings
          at any time — ClipIt keeps working, sightings just won't be placed. Questions about your
          data? Write to{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {})}>
            {CONTACT_EMAIL}
          </Text>
          .
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={colors.primary} style={styles.factIcon} />
      <View style={styles.factBody}>
        <Text style={styles.factTitle}>{title}</Text>
        <Text style={styles.factText}>{children}</Text>
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
  hero: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, marginBottom: spacing.lg },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  heroTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.onPrimary },
  heroText: { fontSize: font.small, color: colors.onPrimary, lineHeight: 20 },
  sectionTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.sm },
  card: { padding: 0, overflow: 'hidden', marginBottom: spacing.lg },
  settings: { padding: 0, overflow: 'hidden', marginBottom: spacing.lg },
  fact: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  factIcon: { marginTop: 2 },
  factBody: { flex: 1 },
  factTitle: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text, marginBottom: 2 },
  factText: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowLabel: { flex: 1, fontSize: font.body, fontFamily: fonts.bodyMedium, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 20 + spacing.md },
  footnote: { fontSize: font.tiny, color: colors.faint, lineHeight: 18 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
});
