// App Store Connect listing for ClipIt, pushed by the GitHub workflow
// "App Store Connect: update listing" (eas metadata:push). Edit the text here,
// then run the workflow. Keep docs/APP_STORE_LISTING.md in step.
//
// This repo is public, so contact details and the demo login are NOT written
// here: they come from GitHub secrets (REVIEW_EMAIL, REVIEW_PHONE,
// DEMO_USERNAME, DEMO_PASSWORD). Anything missing is left as it is in App
// Store Connect.
const env = (name) => (process.env[name] || '').trim() || undefined;

const SCREENSHOTS = [
  '1-identify', '2-scout', '3-story', '4-wall', '5-journal', '6-quests',
].map((name) => `./store/screenshots/iphone-6.9/${name}.png`);

module.exports = {
  configVersion: 0,
  apple: {
    version: '1.0.0', // must match "version" in app.json
    copyright: '2026 Jonathan Cooper',
    categories: [['GAMES', 'GAMES_ADVENTURE'], 'EDUCATION'],
    release: { automaticRelease: false }, // release by hand after approval
    // Age rating questionnaire. Players post photos and comments, so
    // user-generated content is "yes"; everything else is none/no.
    advisory: {
      alcoholTobaccoOrDrugUseOrReferences: 'NONE',
      contests: 'NONE',
      gamblingSimulated: 'NONE',
      gunsOrOtherWeapons: 'NONE',
      horrorOrFearThemes: 'NONE',
      matureOrSuggestiveThemes: 'NONE',
      medicalOrTreatmentInformation: 'NONE',
      profanityOrCrudeHumor: 'NONE',
      sexualContentGraphicAndNudity: 'NONE',
      sexualContentOrNudity: 'NONE',
      violenceCartoonOrFantasy: 'NONE',
      violenceRealistic: 'NONE',
      violenceRealisticProlongedGraphicOrSadistic: 'NONE',
      advertising: false,
      ageAssurance: false,
      gambling: false,
      healthOrWellnessTopics: false,
      lootBox: false,
      messagingAndChat: false,
      parentalControls: false,
      seventeenPlus: false,
      unrestrictedWebAccess: false,
      userGeneratedContent: true,
      kidsAgeBand: null, // not in the Kids category
      ageRatingOverride: 'NONE',
      koreaAgeRatingOverride: 'NONE',
      // ClipIt is for ages 13 and up (sign-up age gate), so rate it 13+ even if
      // the answers alone would give a lower rating.
      ageRatingOverrideV2: 'THIRTEEN_PLUS',
    },
    info: {
      'en-US': {
        title: 'ClipIt: Wildlife Photo Game',
        subtitle: 'Snap wild animals, earn points',
        promoText: "Go outside, photograph a wild animal, and let AI identify it in seconds. Rarer animals and wilder moments score more points. How many species can you find?",
        description: "ClipIt turns every walk into a wildlife hunt \u2014 catch and release, with a camera.\n\nSpot an animal, snap a photo, and ClipIt's AI identifies it in seconds and scores your sighting. A pigeon on the sidewalk is worth a little. A heron catching a fish, a fox with her kits, or a hawk mid-flight is worth a lot. The rarer the animal and the more dramatic the moment, the bigger the points.\n\nSNAP AND SCORE\n\u2022 Point, shoot, and get an ID in seconds: species, a fun fact, and your score\n\u2022 Rarity and scene bonuses for young, in flight, courtship, herds and hunts\n\u2022 Upload photos you've already taken from your camera roll\n\u2022 No signal on the trail? Captures are saved and scored once you're back online\n\u2022 Think the AI got it wrong? Record your own ID on the sighting\n\nBUILD YOUR FIELD JOURNAL\n\u2022 Every sighting is saved to your personal journal with the photo, date and place\n\u2022 Browse all your photos, group them by species, and search your finds\n\u2022 Add your own field notes to any sighting\n\nMEET SCOUT, YOUR AI FIELD GUIDE\n\u2022 A friendly fox who posts twice a day: what's happening near you, and an animal of the day\n\u2022 Tap any post to read the story: why animals do what they do, and where to look\n\u2022 See what's happening near you each week: who's migrating, nesting or spawning\n\u2022 Swipe through fun facts and photos about every new animal you find\n\u2022 Discover explorers near you, or who found the same animals, to follow\n\nQUESTS, STREAKS AND THE LEADERBOARD\n\u2022 Three new quests from Scout every Monday, plus daily streaks\n\u2022 Climb the leaderboard against everyone, or just your friends\n\u2022 Track how many species you've found\n\nSHARE WITH THE COMMUNITY\n\u2022 Post your best sightings to the wall, then like, comment and follow other explorers\n\u2022 Shared posts never include your location, so wildlife spots stay private\n\u2022 Report or block anyone, any time; reports are reviewed within 24 hours\n\nOBSERVE, DON'T DISTURB\nClipIt rewards the photo, never the proximity. Keep your distance, never feed or chase animals, and let wildlife stay wild. The best shots come from patience, not getting close.\n\nClipIt is for ages 13 and up.\n\nPrivacy Policy: https://clipitwildlife.app/legal/privacy\nTerms of Use: https://clipitwildlife.app/legal/terms",
        keywords: ["nature", "birding", "bird", "identify", "species", "safari", "hiking", "outdoors", "deer", "fox", "journal", "explore", "naturalist"],
        marketingUrl: 'https://clipitwildlife.app',
        supportUrl: 'https://clipitwildlife.app/support',
        privacyPolicyUrl: 'https://clipitwildlife.app/legal/privacy',
        screenshots: { APP_IPHONE_67: SCREENSHOTS }, // the 6.9" iPhone slot
      },
    },
    review: {
      firstName: 'Jonathan',
      lastName: 'Cooper',
      email: env('REVIEW_EMAIL'),
      phone: env('REVIEW_PHONE'),
      demoUsername: env('DEMO_USERNAME'),
      demoPassword: env('DEMO_PASSWORD'),
      demoRequired: true,
      notes: "ClipIt is a wildlife photography game. Sign in with the demo account below (or Sign in with Apple). On first use the app asks permission before any photo is sent to the AI (Anthropic's Claude) for identification; tap \"Allow AI identification\".\n\nHow to try it:\n1. Tap the green camera button and photograph any animal. In the office, it's easiest to point the camera at a photo of a wild animal on another screen, or use the gallery icon to upload one from Photos. The AI identifies it and awards points in a few seconds.\n2. Feed tab: the community wall. On any other user's post or comment, tap \"\u2022\u2022\u2022\" to Report (reasons + details) or Block. Blocked users can be managed in Profile \u2192 Blocked accounts. Reports are reviewed by our team within 24 hours, and offensive language is filtered before posting.\n3. Account deletion: Profile \u2192 Delete account (permanently deletes the account and all its data).\n4. Privacy Policy, Terms of Use and Help & Support are in Profile.\n\nNotes:\n- ClipIt is 13+; the sign-up age gate turns away anyone younger.\n- Camera, location and photo access are requested only when used. The app works if location is denied.\n- Precise (GPS) location stays on the device and is never shared with other users; only the broad home region the player picks (e.g. \"Northeast\") is saved, privately.\n- Domestic pets and people are recognized but intentionally score 0 points (only wild animals count).\n- Scout is an AI companion made by our team (a cartoon fox), always shown with an \"AI\" badge (tap it for an explanation). Scout posts in the Feed: an animal of the day, what wildlife is doing near the player's home region each week, fun facts about the animals they find, and weekly quests. Scout isn't a real user, never competes with players, and isn't on the leaderboard. Tapping a post opens a short illustrated story about it. Every photo Scout shows can be reported with the flag icon (\"Wrong photo?\"), which hides it immediately. Its posts can be hidden in Profile \u2192 \"Show Scout in my feed\". Once a week Scout suggests other players to follow (based on public wall posts and, only if both allow it, the same home region; regions are never shown); players can opt out in Profile, and it is off by default for ages 13\u201317.",
    },
  },
};
