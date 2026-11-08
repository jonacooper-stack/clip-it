// Renders a legal document (privacy policy / terms). These screens are also
// public web pages on the Vercel deployment, so they work signed-out and when
// opened directly from a link (no back stack).
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { CONTACT_EMAIL, EFFECTIVE_DATE, type LegalSection } from '@/lib/legal';

export function LegalDoc({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro?: string;
  sections: LegalSection[];
  children?: ReactNode; // extra content rendered above the sections
}) {
  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator>
        <View style={styles.inner}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.date}>Effective {EFFECTIVE_DATE}</Text>
          {!!intro && <Text style={styles.p}>{intro}</Text>}
          {children}
          {sections.map((s) => (
            <View key={s.heading} style={styles.section}>
              <Text style={styles.h2}>{s.heading}</Text>
              {s.paragraphs?.map((p, i) => (
                <Text key={i} style={styles.p}>{p}</Text>
              ))}
              {s.bullets?.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={[styles.p, styles.bulletText]}>{b}</Text>
                </View>
              ))}
            </View>
          ))}
          <Pressable onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} style={styles.contact}>
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <Text style={styles.contactText}>{CONTACT_EMAIL}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export const legalStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  cardTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.text },
  rowDetail: { fontSize: font.small, color: colors.muted, lineHeight: 20, marginTop: 1 },
  neverRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  neverText: { flex: 1, fontSize: font.small, color: colors.text, lineHeight: 20 },
});

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
  headerTitle: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: font.title + 2, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.sm },
  date: { fontSize: font.small, color: colors.faint, marginTop: 2, marginBottom: spacing.sm },
  section: { marginTop: spacing.lg },
  h2: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.xs },
  p: { fontSize: font.small + 1, color: colors.muted, lineHeight: 22, marginTop: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: { fontSize: font.small + 1, color: colors.primary, lineHeight: 22, marginTop: spacing.xs },
  bulletText: { flex: 1 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  contactText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.primary },
});
