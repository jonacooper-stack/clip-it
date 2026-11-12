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
export const EFFECTIVE_DATE = 'November 12, 2026';

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
    { icon: 'image-outline', title: 'Photos', detail: 'Photos you take are sent to our AI to identify the animal. A copy of each one that counts as a sighting is kept with your journal in your account, where other players can’t see it. Photos you share to the wall, and your profile picture, are stored so others can see them.' },
    { icon: 'book-outline', title: 'Your journal, and roughly where you took each sighting', detail: 'Your sightings (species, time, points and field notes, and the place to about a kilometre if you choose to save places) are saved to your account, so they follow you to a new phone. Other players can’t see them.' },
    { icon: 'chatbubble-outline', title: 'Your posts', detail: 'Captions, comments, likes, follows and reports you make.' },
    { icon: 'person-outline', title: 'Account ID, age range & home region', detail: 'An account ID, your age range (13–17 or adult) from sign-up, and the home region you pick for wildlife forecasts. We never store your birth date.' },
  ],
  never: [
    'We never share your location with other players, and wall posts never include where you were.',
    'We don’t sell your data, show ads, or track you across other apps and websites.',
    'Your journal is private: other players can never see your sightings, their photos or where you took them. The exact spot of a sighting never leaves your phone.',
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
      'Your field journal: the sightings that count (the species, when you took the photo, its points, your field-note answers, any species you suggest instead, a copy of the photo and, if you choose to save places, roughly where you took it). It is saved to your account so it survives a new phone or a reinstall. Other players can never read it; our team looks at it only to fix a problem you report or to check a photo that was turned down. If your account is older than this change, the app asks you once before saving anything. You can stop the backup in Profile at any time and choose whether to delete what was saved (your score then stops counting on the leaderboard).',
      'Things you share: sightings you post to the wall (photo, species, points and caption), comments, likes, follows, friend requests, and reports or blocks you make.',
      'Home region: the region you choose (for example “Northeast”), so Scout can post what animals are up to where you explore and suggest explorers near you. It is kept private: other players never see it. If you tap “use my current location”, your phone suggests a region on the device; your location is not sent to us.',
    ],
  },
  {
    heading: 'Photos and identification',
    paragraphs: [
      'When you capture or upload a photo, a downscaled copy is sent to our server, which asks an AI service (Anthropic’s Claude) to identify the animal. Our AI provider processes it under commercial terms that don’t allow it to use your photos to train its models. If your journal is saved to your account and the photo counts as a sighting (a wild animal), we keep that copy with your journal, in private storage that other players can’t open. With the photo, the app then also sends which sighting it is, when it was taken and, if you save places, roughly where. None of that is passed to the AI service. Photos that don’t count (a pet, a person, nothing found) are not kept on our server. A sighting from before journals were saved to accounts may be sent to the identifier once more, so that our server can score it.',
      'To keep the game fair, we check that a photo is your own. The AI looks for signs that it is a picture of a screen or a print, a screenshot, or a stock or computer-made image. For a photo uploaded from your camera roll, the app tells us whether the file carries a camera’s details (only yes or no, never the details themselves). And we keep a fingerprint of each sighting’s photo, and of photos posted to the wall: a short code worked out from the picture, from which the picture cannot be rebuilt, used to spot the same photo being handed in twice. If a photo is turned down as a copy, we keep a note of which sighting it was and which photo it matched, for 90 days, so a mistake can be put right.',
      'To prevent abuse, we keep daily counts of how many photos your account has had identified, scored and turned down, and how often your journal was saved. Counts are deleted after about a week.',
      'Downscaling removes the details saved inside the photo file (such as GPS coordinates) before the photo leaves your device, and our server removes any that remain before it stores a copy. For a photo you upload from your camera roll, the app first reads the date and place saved in it and uses them as the sighting’s time and place. Photos you share to the wall have the same details removed.',
    ],
  },
  {
    heading: 'Scout, your AI companion',
    paragraphs: [
      'Scout is an AI companion made by the ClipIt team. It is not a real person and is always labeled “AI”. When you log a sighting, the species name (never your photo or location) is sent to our server so Scout can share facts about it and show other players’ wall posts of the same species. Facts and the daily and weekly posts are written by our AI provider and stored per species or per region, not per person. Some photos in Scout’s posts come from Wikimedia Commons and are credited on the photo; each one is checked by AI before it’s shown. If you report a photo (“Wrong photo?”), we store the photo’s address, the animal and where it appeared, linked to your account, so our team can review it. Quests and your score are worked out from your journal; so that weekly quests follow your own week, the app tells us your time zone (for example “America/Denver”) and we keep it with your account.',
      'Scout also suggests explorers you might like: players whose public wall posts show the same animals you’ve found, or who explore the same home region (only if they allow it). To match finds, the app sends the names of the species in your journal with that request, and nothing from that request is kept. Suggestions never show anyone’s region. To stop being suggested to others, turn off “Let Scout suggest me to others” in Profile; for ages 13–17 it starts off.',
    ],
  },
  {
    heading: 'Location',
    paragraphs: [
      'ClipIt tags each sighting with a place: where you were when you took it (if you allow location access) or, for a photo you upload from your camera roll, the place saved in that photo. The exact spot stays on your phone. If “Save places with my journal” is on, an approximate place (to about a kilometre) is sent to our server and saved with the sighting in your account, so your journal is complete on any device you sign in to. Other players never see it, it is never included in wall posts, and it is never sent to our AI provider. The switch is in Profile; for ages 13–17 it starts off. Turn it off and places stay on your phone, and we remove the ones already saved. Turning off location access in your device settings stops new camera sightings being tagged, but not photos you upload; the app still works without it.',
    ],
  },
  {
    heading: 'Information stored on your device',
    paragraphs: [
      'Your settings are stored on your device, along with a copy of your journal and its full-size photos, so the app works without a signal. If more than one person signs in on the same device, each account has its own journal there. If you choose “Save photos to camera roll”, your photos are also saved to your photo library, where they’re yours to keep or delete.',
    ],
  },
  {
    heading: 'How we use information',
    bullets: [
      'To create and secure your account and keep you signed in.',
      'To identify wildlife in your photos and score your sightings.',
      'To keep your journal saved to your account, and to keep the game fair by checking that photos are a player’s own.',
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
      'Vercel: hosting for our website and for the server that identifies photos and saves your journal.',
      'Anthropic: AI identification of the animal in a photo.',
      'Expo: delivering app updates.',
      'Apple and Google: only if you choose to sign in with them.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'ClipIt is for people aged 13 and over. We ask for the month and year you were born (and keep only an age range), and we don’t let anyone under 13 create an account. Nothing from a journal is saved to an account until that question has been answered. If the answer shows someone is under 13, we sign them out and delete anything saved to that account’s journal. We don’t knowingly collect personal information from children under 13. If you’re a parent and believe your child has given us information, contact us and we will delete it.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your account information for as long as your account exists. When you delete your account, your profile, journal, posts, comments, likes, follows and friendships are deleted right away, and the stored copies of your photos are removed by a clean-up that runs every night. When you delete a single sighting, its photo, place, points and notes are removed; we keep a marker with the species and the photo’s fingerprint for as long as your account exists, so that the same photo can’t be scored again. Notes about photos that were turned down are kept for 90 days. Reports you filed about other people’s content may be kept, without your name attached, so we can keep the community safe. Our server’s activity logs, which record an account ID and what happened (never photos, names or places), are kept by our hosting provider for a limited time. Information in routine backups ages out within 30 days.',
    ],
  },
  {
    heading: 'Your choices and rights',
    bullets: [
      'Delete your account at any time in the app: Profile → Delete account. This permanently erases your account and everything linked to it.',
      'Unshare any post from the wall, or remove your profile picture, whenever you like.',
      'Block anyone, and report posts, comments or players who break the rules.',
      'Choose in Profile whether your journal is saved to your account and whether places are saved with it. Turn off location or photo access in your device settings.',
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
      'You own the photos and words you post. By sharing them on ClipIt, you give us a non-exclusive, royalty-free, worldwide license to host, display and distribute them within the app so the community can see them. The license ends when you delete the content or your account. Only post photos you took yourself. If your journal is saved to your account, we also keep a private copy of each journal photo so we can show your journal back to you. We don’t show it to anyone else.',
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
    a: 'No other player. The exact spot of each sighting stays on your phone. If you save places with your journal, an approximate place (to about a kilometre) is saved in your account; it is never shown to other players or included in wall posts. Our team sees it only if we need to look into a problem with your account.',
  },
  {
    q: 'I have a new phone. Is my journal gone?',
    a: 'No, as long as your journal backup is on (Profile shows whether it is). Sign in and your journal comes back: sightings, points and photos are saved to your account. (Photos from before journals were saved to accounts are added as your old phone uploads them, on Wi-Fi.)',
  },
  {
    q: 'Why didn’t my photo score?',
    a: 'Only your own photos of wild animals score. Pets and people don’t count. A photo also won’t score if it looks like a picture of a screen or a print, a screenshot, a stock or computer-made image, a photo someone has already logged, or an upload from your camera roll that doesn’t carry a camera’s details (a saved picture, for example). A photo you take with the ClipIt camera never needs those details. If we got it wrong, tell us from Help & Support and we’ll put it right.',
  },
  {
    q: 'How do I stop saving my journal to my account?',
    a: 'Go to Profile → Turn off journal backup. You can also choose to delete what was saved. Your sightings stay on your phone; your score stops counting on the leaderboard until you turn the backup on again. To keep the backup but not places, turn off “Save places with my journal” instead.',
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
    a: 'In the app, go to Profile → Delete account. This permanently deletes your account, journal, posts, photos, comments, likes, follows and friends. If you can’t access the app, email us from the address on your account and we’ll delete it for you.',
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
