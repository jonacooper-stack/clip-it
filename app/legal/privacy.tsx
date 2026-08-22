import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { CONTACT_EMAIL, POLICY_EFFECTIVE } from '@/lib/contact';

// ClipIt's privacy policy. Deliberately a route (not a static file) so the same
// document ships three ways from one source: reachable in-app from Profile, and
// exported to the web build at /legal/privacy — the public URL App Store Connect
// and Google Play require. It sits OUTSIDE (tabs), so it's readable without an
// account, which is what the stores check for.

export default function PrivacyPolicy() {
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
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>ClipIt Privacy Policy</Text>
        <Text style={styles.effective}>Effective {POLICY_EFFECTIVE}</Text>

        <View style={styles.summary}>
          <View style={styles.summaryHead}>
            <Ionicons name="leaf" size={18} color={colors.primary} />
            <Text style={styles.summaryTitle}>The short version</Text>
          </View>
          <Text style={styles.summaryText}>
            Your photos and the exact places you took them stay on your phone unless you choose to
            share them. We never publish a precise location — not on the wall, not anywhere. We send
            a photo to an AI service to identify the animal, and nothing else travels with it. You
            can delete your account, and everything in it, from inside the app.
          </Text>
        </View>

        <P>
          This policy explains what ClipIt collects, why, and what control you have over it. It
          covers the ClipIt mobile app and the ClipIt website.
        </P>

        <H>Who we are</H>
        <P>
          ClipIt is operated by the ClipIt team. For any privacy question, or to ask us to delete
          your data, write to <Mail /> and we'll respond.
        </P>

        <H>What we collect</H>
        <P>We collect only what the app needs to work:</P>
        <Bullet label="Account details">
          Your email address and password when you sign up. If you use Sign in with Apple or Google
          instead, we receive the email address and name that service releases to us — with Apple
          that may be a private relay address, and that's fine.
        </Bullet>
        <Bullet label="Your display name and profile picture">
          Both are shown to other explorers on the leaderboard and the community wall. Choose a
          display name you're comfortable being public.
        </Bullet>
        <Bullet label="An age range, not a birth date">
          The app asks for your birth year to work out whether you're an adult or a teen, then
          stores only that bracket. We do not keep your birth year or your full date of birth.
        </Bullet>
        <Bullet label="Photos you capture">
          Taken with the in-app camera, along with the time and the location where you took them.
        </Bullet>
        <Bullet label="Community activity">
          Anything you post to the wall, plus your comments, likes, follows, and friend requests.
        </Bullet>

        <H>Where your sightings actually live</H>
        <P>
          This is the part most apps get vague about, so plainly: the photos you capture, their
          precise GPS coordinates, and your field journal are stored{' '}
          <Text style={styles.em}>on your device</Text>. They are not uploaded to our servers as
          part of normal use, and we cannot see them.
        </P>
        <P>
          Two things leave your phone, and only these. First, when you capture a sighting, the photo
          is sent to our identification service so the AI can name the animal. Your location, your
          name, and your account are <Text style={styles.em}>not</Text> sent with it — the service
          receives the image and nothing more. Second, when you tap Share on a sighting, the photo,
          the species, the points, and your caption are uploaded to the community wall.
        </P>

        <H>Location</H>
        <P>
          ClipIt asks for location while you're using the app so a sighting is tagged with where you
          saw the animal. That precise coordinate is yours: it stays on your device, it is never
          attached to anything you share, and it is never shown to other users.
        </P>
        <P>
          When a sighting is shared, we strip the image's embedded EXIF metadata (which includes GPS)
          before it is uploaded. If a future version of ClipIt ever shows sightings on a map, shared
          locations will be deliberately coarsened, and locations of endangered or otherwise
          sensitive species will be withheld entirely — protecting animals from being tracked to a
          spot is a design rule for us, not an afterthought.
        </P>
        <P>You can decline the location permission and still use ClipIt; sightings simply won't be placed.</P>

        <H>Photos and your camera roll</H>
        <P>
          The camera permission is used only when you're taking a sighting photo. If you turn on
          "Save photos to camera roll" in Settings, ClipIt also saves a copy to your device's photo
          library — that is a write-only permission, so ClipIt adds photos and never reads or scans
          the rest of your library. Choosing a profile picture opens the system picker, which hands
          us only the single image you select.
        </P>

        <H>How AI identification works</H>
        <P>
          To identify a species, the photo is sent to Anthropic's Claude API through our own server.
          It is processed to return an identification and sent back — Anthropic does not use API
          content to train its models. We don't attach your identity or location to that request.
        </P>
        <P>
          Identification is a best guess, sometimes a wrong one. Nothing the AI returns is a safety
          judgment: keep your distance from wildlife regardless of what the app says.
        </P>

        <H>What other people can see</H>
        <P>
          Your display name, profile picture, points, and species count appear on the leaderboard to
          other signed-in users. Anything you share to the wall — the photo, species, points, and
          caption — is visible to other signed-in users, along with your comments and likes. Your
          email address, your precise locations, and your unshared sightings are never visible to
          anyone else.
        </P>
        <P>
          You can unshare any post at any time, which removes it and its photo, likes, and comments
          for everyone.
        </P>

        <H>Reporting and blocking</H>
        <P>
          Every post and comment has a report action, and you can block another explorer from the
          same menu — blocking hides their posts, comments, and profile from you and hides yours from
          them. We review reports and remove content that breaks the rules, usually within 24 hours.
          You can also write to <Mail /> about anything you see.
        </P>

        <H>Children</H>
        <P>
          ClipIt is not currently open to children under 13. The app asks for a birth year during
          setup, and if it indicates an age under 13 we stop there: no account is created and nothing
          is stored. We are building family accounts, where a parent sets up and approves a child's
          profile with verified consent, and under-13 sign-up will open when that ships.
        </P>
        <P>
          If you believe a child under 13 has created an account, contact <Mail /> and we will delete
          it and its data.
        </P>

        <H>Who processes data for us</H>
        <P>We keep this list short on purpose:</P>
        <Bullet label="Supabase">Accounts, sign-in, and the community wall's database and image storage.</Bullet>
        <Bullet label="Anthropic">The Claude API, which identifies the animal in a photo.</Bullet>
        <Bullet label="Vercel">Hosts our website and the identification endpoint.</Bullet>
        <Bullet label="Apple and Google">Only if you choose their sign-in button, and only to sign you in.</Bullet>
        <P>
          We do not sell your personal information, we do not share it with data brokers, and we
          don't run advertising or third-party analytics or tracking SDKs in the app.
        </P>

        <H>How long we keep things</H>
        <P>
          Account details and community posts are kept until you delete them or delete your account.
          A photo sent for identification is processed for that request and is not retained by us
          afterwards. Anything stored only on your device disappears when you delete the app.
        </P>

        <H>Your choices</H>
        <Bullet label="Delete your account">
          Profile → Delete account removes your account, your profile, your posts and their photos,
          your comments, likes, follows, and friendships. It is immediate and cannot be undone.
          On-device data goes with the app when you uninstall it.
        </Bullet>
        <Bullet label="Unshare a post">The post, its photo, and its comments are removed for everyone.</Bullet>
        <Bullet label="Turn permissions off">
          Camera, location, and photo-library access can each be revoked in your device settings at
          any time.
        </Bullet>
        <Bullet label="Ask us">
          Depending on where you live you may have the right to access, correct, export, or delete
          your personal data. Write to <Mail /> and we'll take care of it — we don't charge for this
          and we won't treat you differently for asking.
        </Bullet>

        <H>Security</H>
        <P>
          Traffic between the app and our services is encrypted in transit. Accounts are protected by
          Supabase authentication, and database access rules restrict every row to the people
          entitled to see it. No system is perfect, but we design so that the most sensitive thing
          ClipIt touches — where wildlife was seen — mostly never leaves your phone.
        </P>

        <H>Changes to this policy</H>
        <P>
          If we change this policy we'll update the date at the top, and for anything significant
          we'll tell you in the app before it takes effect.
        </P>

        <H>Contact</H>
        <P>
          Questions, requests, or reports: <Mail />. We read everything that arrives there.
        </P>

        <View style={styles.footer}>
          <Text style={styles.footerText}>ClipIt — observe, don't disturb.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h}>{children}</Text>;
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Bullet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.dot} />
      <Text style={styles.p}>
        <Text style={styles.bulletLabel}>{label}. </Text>
        {children}
      </Text>
    </View>
  );
}

// Tappable on the phone, a real mailto link on the web.
function Mail() {
  const open = () => Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {});
  return (
    <Text style={styles.link} onPress={open} accessibilityRole="link">
      {CONTACT_EMAIL}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: font.body, fontFamily: fonts.heading, color: colors.text },
  // Cap the measure on the web export so the policy doesn't run edge-to-edge on a
  // desktop browser; on a phone the maxWidth never binds.
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: font.title, fontFamily: fonts.display, color: colors.text },
  effective: { fontSize: font.small, color: colors.faint, marginTop: 4, marginBottom: spacing.lg },
  summary: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  summaryTitle: { fontSize: font.body, fontFamily: fonts.heading, color: colors.onPrimary },
  summaryText: { fontSize: font.small, color: colors.onPrimary, lineHeight: 21 },
  h: { fontSize: font.heading, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  p: { flex: 1, fontSize: font.small, color: colors.muted, lineHeight: 22, marginBottom: spacing.sm },
  em: { fontFamily: fonts.bodyBold, color: colors.text },
  bullet: { flexDirection: 'row', gap: spacing.sm, paddingLeft: spacing.xs },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 9 },
  bulletLabel: { fontFamily: fonts.bodyBold, color: colors.text },
  link: { color: colors.primary, fontFamily: fonts.bodyMedium, ...(Platform.OS === 'web' ? { textDecorationLine: 'underline' } : null) },
  footer: { marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { fontSize: font.tiny, color: colors.faint, textAlign: 'center' },
});
