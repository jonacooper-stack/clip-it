import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LegalDoc, legalStyles as ls } from '@/components/LegalDoc';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { CONTACT_EMAIL, SUPPORT_FAQ } from '@/lib/legal';
import { PHOTO_CREDITS } from '@/lib/photoCredits';

// Public at /support on the web build — the App Store "Support URL".
export default function Support() {
  const router = useRouter();
  return (
    <LegalDoc
      title="Help & Support"
      showDate={false}
      intro="Questions, problems or feedback? We read every message and usually reply within a day."
      sections={[]}
    >
      <Pressable
        onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=ClipIt%20support`)}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="mail" size={18} color={colors.white} />
        <Text style={styles.ctaText}>Email {CONTACT_EMAIL}</Text>
      </Pressable>

      <View style={ls.card}>
        <Text style={ls.cardTitle}>Common questions</Text>
        {SUPPORT_FAQ.map((f) => (
          <View key={f.q} style={styles.faq}>
            <Text style={ls.rowTitle}>{f.q}</Text>
            <Text style={ls.rowDetail}>{f.a}</Text>
          </View>
        ))}
      </View>

      <View style={ls.card}>
        <Text style={ls.cardTitle}>Photo credits</Text>
        <Text style={ls.rowDetail}>
          The wildlife photos in ClipIt are shared on Wikimedia Commons by these photographers, and used
          (resized and cropped) under the licenses shown. Tap one to see the original.
        </Text>
        {PHOTO_CREDITS.map((c) => (
          <Pressable key={c.source} onPress={() => Linking.openURL(c.source)} style={styles.credit}>
            <Text style={ls.rowTitle}>{c.species}</Text>
            <Text style={ls.rowDetail}>
              {c.artist} · {c.license}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.links}>
        <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.link} onPress={() => router.push('/legal/terms')}>Terms of Use</Text>
      </View>
    </LegalDoc>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  ctaText: { fontSize: font.body, fontFamily: fonts.bodyBold, color: colors.white },
  faq: { gap: 2 },
  credit: { gap: 1 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  link: { fontSize: font.small, color: colors.muted, textDecorationLine: 'underline' },
  dot: { fontSize: font.small, color: colors.faint },
});
