// Privacy policy + terms of use content. Rendered in-app at /legal/privacy and
// /legal/terms, which are ALSO public web pages on the Vercel deployment (the
// same expo-router routes) — use that URL as the Privacy Policy URL in App
// Store Connect: https://clipitwildlife.app/legal/privacy
//
// Keep this in sync with what the app actually does, and with the App Store
// privacy label answers in docs/APP_STORE_PRIVACY.md.

// ⚠️ Set these before submitting to the App Store.
export const LEGAL_ENTITY = 'ClipIt';
export const CONTACT_EMAIL = 'support@clipitwildlife.app';
export const EFFECTIVE_DATE = 'November 8, 2026';

export const WEB_BASE = 'https://clipitwildlife.app';
export const PRIVACY_URL = `${WEB_BASE}/legal/privacy`;
export const TERMS_URL = `${WEB_BASE}/legal/terms`;
export const SUPPORT_URL = `${WEB_BASE}/support`;

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

// "Privacy at a glance" — the plain-language label shown at the top of the
// policy. Mirrors the App Store privacy "nutrition label".
export interface GlanceRow {
  icon: string; // Ionicons name
  title: string;
  detail: string;
}

export const PRIVACY_GLANCE: { collected: GlanceRow[]; never: string[] } = {
  collected: [
    { icon: 'mail-outline', title: 'Contact info', detail: 'Your email address and display name, to run your account.' },
    { icon: 'image-outline', title: 'Photos', detail: 'Photos you take are sent to our AI to identify the animal. Photos you share to the wall, and your profile picture, are stored so others can see them.' },
    { icon: 'chatbubble-outline', title: 'Your posts', detail: 'Captions, comments, likes, follows and reports you make.' },
    { icon: 'person-outline', title: 'Account ID, age range & home region', detail: 'An account ID, your age range (13–17 or adult) from sign-up, and the home region you pick for wildlife forecasts. We never store your birth date.' },
  ],
  never: [
    'We never share your location with other players, and wall posts never include where you were.',
    'We don’t sell your data, show ads, or track you across other apps and websites.',
    'Your journal (sightings, places and times) stays on your device.',
  ],
};

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      `ClipIt is a wildlife-spotting game operated by ${LEGAL_ENTITY} (“ClipIt”, “we”, “us”). This policy explains what information the ClipIt app and website collect, how we use it, and the choices you have. If you have questions, email ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'Information you give us',
    bullets: [
      'Account details: your email address, a password (stored only in hashed form by our authentication provider), your display name, and the age range you choose. If you sign in with Apple or Google, we receive your name and email (or Apple’s private relay email if you choose to hide it) from them.',
      'Profile picture: if you add one, it is visible to other signed-in players.',
      'Things you share: sightings you post to the wall (photo, species, points and caption), comments, likes, follows, friend requests, and reports or blocks you make.',
      'Home region: the region you choose (for example “Northeast”), so Scout can post what animals are up to where you explore and suggest explorers near you. It is kept private: other players never see it. If you tap “use my current location”, your phone suggests a region on the device; your location is not sent to us.',
    ],
  },
  {
    heading: 'Photos and identification',
    paragraphs: [
      'When you capture or upload a photo, a downscaled copy is sent to our server, which asks an AI service (Anthropic’s Claude) to identify the animal. The copy is sent only to produce the identification; we don’t keep it on our server, and our AI provider processes it under commercial terms that don’t allow it to use your photos to train its models.',
      'Downscaling removes the photo’s embedded metadata (such as GPS coordinates) before anything leaves your device. Photos you share to the wall have the same metadata removed.',
    ],
  },
  {
    heading: 'Scout, your AI companion',
    paragraphs: [
      'Scout is an AI companion made by the ClipIt team. It is not a real person and is always labeled “AI”. When you log a sighting, the species name (never your photo or location) is sent to our server so Scout can share facts about it and show other players’ wall posts of the same species. Facts and the daily and weekly posts are written by our AI provider and stored per species or per region, not per person. Some photos in Scout’s posts come from Wikimedia Commons and are credited on the photo; each one is checked by AI before it’s shown. If you report a photo (“Wrong photo?”), we store the photo’s address, the animal and where it appeared, linked to your account, so our team can review it. Weekly quests are worked out on your phone from your journal.',
      'Scout also suggests explorers you might like: players whose public wall posts show the same animals you’ve found, or who explore the same home region (only if they allow it). To match finds, the names of the species in your journal are sent to our server and are not stored. Suggestions never show anyone’s region. To stop being suggested to others, turn off “Let Scout suggest me to others” in Profile; for ages 13–17 it starts off.',
    ],
  },
  {
    heading: 'Location',
    paragraphs: [
      'If you allow location access, ClipIt tags each sighting with where you took it so it appears correctly in your field journal. That location is saved on your device, in your journal. It is not included when a photo is sent for identification, and it is never shown to other players or included in wall posts. You can turn off location access at any time in your device settings; the app still works without it.',
    ],
  },
  {
    heading: 'Information stored on your device',
    paragraphs: [
      'Your field journal, points, streaks, quest progress and settings are stored locally on your device. If you choose “Save photos to camera roll”, your photos are also saved to your photo library, where they’re yours to keep or delete.',
    ],
  },
  {
    heading: 'How we use information',
    bullets: [
      'To create and secure your account and keep you signed in.',
      'To identify wildlife in your photos and score your sightings.',
      'To run the community features: the wall, comments, likes, follows, friends and the leaderboard (your display name, profile picture, points and species count are visible to other signed-in players).',
      'To keep the community safe: reviewing reports, removing content that breaks our rules, and suspending accounts.',
      'To respond to you when you contact us.',
    ],
    paragraphs: [
      'We don’t use your information for advertising, we don’t sell or rent it, and we don’t track you across other companies’ apps or websites.',
    ],
  },
  {
    heading: 'Who we share it with',
    paragraphs: [
      'We share information only with service providers that run ClipIt on our behalf, under agreements that limit their use of it to providing their service:',
    ],
    bullets: [
      'Supabase: accounts, database and photo storage.',
      'Vercel: hosting for our website and identification server.',
      'Anthropic: AI identification of the animal in a photo.',
      'Expo: delivering app updates.',
      'Apple and Google: only if you choose to sign in with them.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'ClipIt is for people aged 13 and over. We ask for your birth year at sign-up (and keep only an age range) and don’t let anyone under 13 create an account. We don’t knowingly collect personal information from children under 13. If you’re a parent and believe your child has given us information, contact us and we will delete it.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your account information for as long as your account exists. When you delete your account, your profile, posts, photos, comments, likes, follows and friendships are deleted right away. Reports you filed about other people’s content may be kept, without your name attached, so we can keep the community safe. Information in routine backups ages out within 30 days.',
    ],
  },
  {
    heading: 'Your choices and rights',
    bullets: [
      'Delete your account at any time in the app: Profile → Delete account. This permanently erases your account and everything linked to it.',
      'Unshare any post from the wall, or remove your profile picture, whenever you like.',
      'Block anyone, and report posts, comments or players who break the rules.',
      'Turn off location or photo access in your device settings.',
      `Ask us for a copy of your information, or to correct it, by emailing ${CONTACT_EMAIL}. Depending on where you live (for example the EU, UK or California) you may have additional rights, and we will honor them.`,
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Information is encrypted in transit, and access to your data is restricted by account-level security rules, so only you can change your account and content. No system is perfectly secure, but we work to protect your information and will notify you if a breach affects you.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If we make material changes, we’ll update the date at the top and let you know in the app before they take effect.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [`Questions or requests: ${CONTACT_EMAIL}`],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'Welcome to ClipIt',
    paragraphs: [
      `These terms are an agreement between you and ${LEGAL_ENTITY}. By creating an account or using ClipIt, you agree to them and to our Privacy Policy. You must be at least 13 years old to use ClipIt. If you’re under 18, you need a parent or guardian’s permission, and they agree to these terms on your behalf.`,
    ],
  },
  {
    heading: 'Observe, don’t disturb',
    paragraphs: [
      'ClipIt rewards the photo, never the proximity. Keep a safe distance from all wildlife, never feed, bait, chase, corner or handle animals, stay on legal and public land (or land you have permission to be on), and follow local wildlife laws. Your safety is your responsibility. No sighting is worth putting yourself, other people or an animal at risk.',
    ],
  },
  {
    heading: 'Community rules (zero tolerance)',
    paragraphs: [
      'ClipIt has zero tolerance for objectionable content or abusive users. You may not post, comment or send anything that:',
    ],
    bullets: [
      'Harasses, bullies, threatens or impersonates anyone.',
      'Is hateful or discriminatory, or attacks people for who they are.',
      'Is sexual, violent or graphic, or shows animals being harmed, baited or harassed.',
      'Reveals someone’s location or personal information, including sensitive wildlife locations such as nests or dens.',
      'Is spam, a scam, or advertising, or infringes someone else’s rights.',
    ],
  },
  {
    heading: 'Reporting and moderation',
    paragraphs: [
      'You can report any post, comment or player, and block anyone, from the “•••” menu. We review reports within 24 hours. We remove content that breaks these rules and may suspend or permanently remove accounts that break them, without notice.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You own the photos and words you post. By sharing them on ClipIt, you give us a non-exclusive, royalty-free, worldwide license to host, display and distribute them within the app so the community can see them. The license ends when you delete the content or your account. Only post photos you took yourself.',
    ],
  },
  {
    heading: 'AI identification and scores',
    paragraphs: [
      'Species identifications and scores are made by AI and may be wrong. Don’t rely on ClipIt to tell you whether an animal is safe, dangerous or legally protected. Points, streaks and rankings are part of the game and have no cash value.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'Keep your login secure and don’t share your account. You can delete your account at any time from Profile → Delete account.',
    ],
  },
  {
    heading: 'Disclaimers and liability',
    paragraphs: [
      'ClipIt is provided “as is”, without warranties of any kind. To the fullest extent permitted by law, we are not liable for indirect or consequential damages, or for any injury or loss arising from your outdoor activities. Nothing in these terms limits rights you have under the laws where you live that can’t be limited.',
    ],
  },
  {
    heading: 'Apple App Store',
    paragraphs: [
      'If you downloaded ClipIt from the App Store, Apple’s Standard End User License Agreement also applies. Apple is not responsible for the app or its content and has no obligation to provide support for it.',
    ],
  },
  {
    heading: 'Changes',
    paragraphs: [
      'We may update these terms. If we make material changes, we’ll let you know in the app; continuing to use ClipIt after that means you accept the new terms.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [`Questions: ${CONTACT_EMAIL}`],
  },
];

// Support page FAQ (/support — the App Store "Support URL").
export const SUPPORT_FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I score points?',
    a: 'Tap the camera button, photograph a wild animal (or upload a photo you took), and ClipIt identifies it in a few seconds. Rarer animals and more dramatic moments (a parent with young, an animal in flight, a hunt) score more. Pets and people don’t score.',
  },
  {
    q: 'The AI got the animal wrong. What can I do?',
    a: 'Open the sighting in your Journal and tap “Not right? Suggest an ID” to record the right species in your journal. Identifications are made by AI and can be wrong, especially with distant, blurry or look-alike animals.',
  },
  {
    q: 'I took a photo with no signal. Is it lost?',
    a: 'No. ClipIt saves the capture and identifies it automatically when you’re back online.',
  },
  {
    q: 'Who can see my location?',
    a: 'Only you. Locations are saved in your journal on your device and are never shown to other players or included in wall posts.',
  },
  {
    q: 'How do I report a post, comment or person?',
    a: 'Tap the “•••” next to the post or comment and choose Report or Block. We review every report within 24 hours. Blocked people can’t appear in your feed, comments, search or leaderboard; manage them in Profile → Blocked accounts.',
  },
  {
    q: 'How do I remove something I shared?',
    a: 'Tap the “•••” on your post and choose Unshare. It’s removed from the wall for everyone; the sighting stays in your journal.',
  },
  {
    q: 'How do I delete my account?',
    a: 'In the app, go to Profile → Delete account. This permanently deletes your account, posts, photos, comments, likes, follows and friends. If you can’t access the app, email us from the address on your account and we’ll delete it for you.',
  },
  {
    q: 'Who is Scout?',
    a: 'Scout is ClipIt’s AI field guide, a friendly fox made by the ClipIt team and always marked with an “AI” badge. Scout posts in your Feed twice a day: in the morning, what wildlife is up to near you; in the afternoon, an animal of the day. Tap “Read the story” on any post to go deeper. Scout also shares fun facts about the animals you find and sets three new quests every Monday. If a photo looks wrong, tap the flag on it and we’ll hide it right away. Once a week Scout also suggests explorers you might like to follow. Scout never competes with you and isn’t on the leaderboard. To hide Scout’s posts, turn off “Show Scout in my feed” in Profile; to stop being suggested to others, turn off “Let Scout suggest me to others”.',
  },
  {
    q: 'Who can use ClipIt?',
    a: 'ClipIt is for people aged 13 and over.',
  },
];
