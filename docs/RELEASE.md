# Shipping ClipIt as a native app (iOS first)

This is the "fast path": get a real, installable app onto your iPhone and your
friends' iPhones, keep the web version, and keep iterating quickly via
over-the-air (OTA) updates. The app config (`app.json`, `eas.json`, icons) is
already done — the steps below are the parts that need **your** accounts and run
on Expo's servers, so you don't need anything installed locally.

> **Why iOS first:** that's the device we have. Android is included below as an
> optional add-on for later — every command just swaps `-p ios` for `-p android`.

## 0. Accounts you'll need (one time)
- **Expo account** — free, https://expo.dev (this is what runs the builds).
- **Apple Developer Program** — $99/yr, https://developer.apple.com/programs. This
  is required to put the app on a physical iPhone (Apple has no free path to
  install on a device beyond a 7-day personal signing). It's also what unlocks
  **TestFlight**, which is how friends install.
- *(Later, optional)* **Google Play Console** — $25 once, for Android.

## 1. One-time project setup
Run these from the repo root, logged in as you:

```bash
npm install -g eas-cli         # or use: npx eas-cli@latest ...
eas login                      # sign into your Expo account
eas init                       # links this repo to an Expo project, writes the project id
npx expo install expo-updates  # adds the OTA runtime
eas update:configure           # wires up OTA (sets the updates URL + channels)
```

That's it for setup — `app.json` already has the icon, splash, permissions, bundle
ID (`com.clipitwildlife.app`), and a `runtimeVersion` policy ready to go.

> Want a different bundle id (e.g. `com.getoveralls.clipit`)? Change `ios.bundleIdentifier`
> in `app.json` **before** the first build — it can't change after you submit to the store.

## 2. Get it on iPhones — TestFlight (recommended)
TestFlight is Apple's beta channel: you upload one build and invite up to 10,000
testers, who install through the free TestFlight app. This is the simplest way to
share with friends.

```bash
eas build -p ios --profile production   # build on Expo's servers (real-device build)
eas submit -p ios --latest              # upload that build to App Store Connect → TestFlight
```

- The **first** iOS build will offer to create signing credentials — let EAS manage
  them (say yes). You'll sign in with your Apple Developer account once.
- After `eas submit`, go to **App Store Connect → your app → TestFlight**:
  - **Internal testers** (up to 100, must be in your team) get the build in minutes,
    no review. Fastest for you + close friends.
  - **External testers** (up to 10,000, invite by email or public link) need a
    one-time **Beta App Review** per version — usually approved within a day.
- Testers install the **TestFlight** app, tap your invite, and they're in.

### Alternative: ad-hoc install link (no TestFlight)
The `preview` profile builds an **internal-distribution** IPA you share as a direct
install link — but iOS requires each tester's device **UDID registered first**, so
it's more friction than TestFlight. Use it only if you want to skip App Store Connect:
```bash
eas device:create               # register each tester's iPhone (once per device)
eas build -p ios --profile preview
```

### iOS code signing from CI (App Store Connect API key)
A headless CI build can't do the interactive Apple login, so EAS authenticates to
Apple with an **App Store Connect API key** to create/manage the signing
certificate + provisioning profile automatically. One-time setup:

1. **Create the key:** App Store Connect → **Users and Access → Integrations**
   (API keys) → **＋** beside *Active* → name it, role **Admin** → **Download** the
   `.p8` (you only get one download) and copy the **Key ID** and **Issuer ID**.
2. **Base64-encode the .p8** so it fits in a secret: `base64 -i AuthKey_XXXX.p8`
   (macOS prints it; copy the whole string).
3. **Add repo secrets** (GitHub → Settings → Secrets and variables → Actions):
   | Secret | Value |
   |---|---|
   | `ASC_API_KEY_BASE64` | the base64 string from step 2 |
   | `ASC_KEY_ID` | the Key ID (e.g. `SFB993FB5F`) |
   | `ASC_ISSUER_ID` | the Issuer ID (a UUID) |
   | `APPLE_TEAM_ID` | your 10-char Apple Team ID (Apple Developer → Membership) |
   | `APPLE_TEAM_TYPE` | `INDIVIDUAL` (personal account) or `COMPANY_OR_ORGANIZATION` |

   The `eas-build.yml` workflow already reads these (`EXPO_ASC_*` / `EXPO_APPLE_*`)
   and writes the `.p8` to a temp file at build time — nothing key-related is
   committed. Android builds ignore them.

> Even simpler if you prefer no secrets: once the project exists on expo.dev, go to
> **Project → Credentials → iOS** and upload the same `.p8` there. EAS then stores
> it and every CI build uses it automatically — for both building and `eas submit`.

## 3. Iterate fast — OTA updates (no rebuild, no review)
The project is already wired for OTA (`expo-updates` + the update URL in `app.json`), so
once a build that includes `expo-updates` is installed, any **JavaScript / UI / content**
change ships straight to installed apps — live on next launch, same speed as the web loop.

**From GitHub (no local machine):** Actions tab → **"EAS Update (OTA)" → Run workflow** →
pick your branch, set a message, channel `production` (the TestFlight / App Store build).
~1 minute. Needs the `EXPO_TOKEN` secret.

**From a terminal (if you have one):**
```bash
eas update --branch production -m "what changed"   # TestFlight / App Store builds
eas update --branch preview   -m "what changed"    # internal preview builds
```

> **First OTA-capable build:** an update only reaches a build that **already included
> `expo-updates`**. The current pending full build is the first such build — after it's
> installed, JS-only tweaks are OTA from then on.

### What needs a new build (occasional) vs. an OTA update (almost always)
| New build + TestFlight | OTA update (`eas update`) |
|---|---|
| New native module / Expo SDK bump | JS/TS code, screens, logic |
| Icon, splash, permissions, app name | Styles, the design refresh |
| Push notifications, in-app purchases, ads | Copy, images, bug fixes |

Rule of thumb: if you didn't change anything under `ios.` / `plugins` in `app.json`
and didn't add a native dependency, an OTA update is all you need. (The OTA workflow is
intentionally **manual**, not on-every-push, so a native change can't accidentally ship a
broken update — those go through a full build, which bumps the runtime and is only
delivered to a matching build.)

## 4. Build without a local machine (from GitHub)
`.github/workflows/eas-build.yml` runs the build on Expo's servers straight from the
GitHub UI: **Actions tab → "EAS Build" → Run workflow → platform `ios`, profile
`production`**. Needs the same `EXPO_TOKEN` secret. The build link shows in the run log
and your Expo dashboard. (`eas submit` is still a one-liner you run once it's built.)

## 5. The web version keeps shipping
Nothing changes — `npx expo export -p web` still builds the web app and Vercel deploys it
from the same codebase. Native and web run from one project.

## 6. Adding Android later (optional)
When you want it on Android too, everything's already wired — add a Google Play
Console account ($25 once) and:
```bash
eas build -p android --profile preview    # direct APK install link, no review
```
Send friends the link; they tap and install. Same OTA updates apply.

## 7. App Store launch checklist

The app-side requirements are built in: in-app account deletion, Sign in with
Apple, report + block, a profanity filter, and the privacy policy and terms of
use (in the app and on the web). What's left is setup in your accounts:

### a. Supabase (one time)
1. **SQL editor:** run `supabase/migrations/0006_safety_and_account_deletion.sql`.
   This adds blocks, reports and the `delete_my_account()` function. Until it
   runs, Report/Block/Delete show an error and nothing else breaks.
2. **Authentication → Providers → Apple:** enable it, and under **Client IDs**
   add `com.clipitwildlife.app`. For native iOS sign-in this is all you need;
   the secret key fields are only for web sign-in.
3. **Moderation:** check **Table editor → content_reports** daily (Apple expects
   reports to be acted on within 24h). To take content down, delete the row in
   `feed_posts` / `post_comments`. To ban someone, delete the user under
   **Authentication → Users**. Mark the report `actioned` or `dismissed`.
   Tip: Database → Webhooks can email or Slack you on each new report.

### b. Apple
- No manual step for Sign in with Apple: `ios.usesAppleSignIn` in `app.json`
  makes EAS turn on the capability for the App ID at the next build.
- A **new EAS build is required** (native change: Apple sign-in + iPhone-only).
  An OTA update won't deliver it.

### c. App Store Connect listing
- **Privacy Policy URL**, **App Privacy** answers, and age rating: see
  [APP_STORE_PRIVACY.md](APP_STORE_PRIVACY.md).
- Name, subtitle, description, keywords, screenshots plan, categories and the
  **reviewer notes**: copy from [APP_STORE_LISTING.md](APP_STORE_LISTING.md).
- Screenshots: **6.9" iPhone only** (the app is iPhone-only, `supportsTablet: false`).
- Support URL: `https://clipitwildlife.app/support`.
- **App Review Information:** a demo email/password login with some content on the wall.
- Version 1.0 → select the build → **Submit for Review**.

### d. Identification endpoint is signed-in only
`api/identify.ts` now rejects requests without a valid Supabase sign-in token
(the app sends one automatically). Builds made before this change don't send a
token, so **right after this deploys to Vercel, run the "EAS Update (OTA)"
workflow** (channel `production`) so installed TestFlight builds pick up the new
client code. Otherwise identification falls back to the demo identifier on
those builds until they update.

### e. Domain and email (clipitwildlife.app)
- The domain must be attached to the Vercel project (Project → Settings →
  Domains) so `https://clipitwildlife.app/legal/privacy` and `/support` load.
- Supabase → Authentication → URL Configuration: set the **Site URL** to
  `https://clipitwildlife.app`, and under **Redirect URLs** have
  `https://clipitwildlife.app/**`, `https://clip-it-rose.vercel.app/**` and
  `clipit://auth/callback`. Web Google sign-in returns to `/feed` (the
  site's `/` is now the marketing page), so the `/**` wildcard is required.
- Website layout: `site/` is the static marketing site (served at `/`, plus
  `/credits.html`); every other path is the Expo web app. `scripts/build-web.mjs`
  stitches them together after `expo export` (see `vercel.json`).
- Photos: wildlife photos come from Wikimedia Commons under PD / CC0 / CC BY /
  CC BY-SA. Credits are required and live in `src/lib/photoCredits.ts` (app:
  Help & support → Photo credits) and `site/credits.html` (website footer).
  Add a credit there whenever you add a photo.
- `support@clipitwildlife.app` must receive mail. It's forwarded with ImprovMX:
  MX `mx1.improvmx.com` (10) and `mx2.improvmx.com` (20), plus TXT
  `v=spf1 include:spf.improvmx.com ~all`, in Vercel → Domains → DNS records.

### f. Scout, the AI companion
One friendly fox-bot, **Scout**, always shown with an **AI** badge. Scout never
competes: it isn't on the leaderboard and there are no duels. Everything it
says is short and simple (one fact per slide, emoji first, bullets not
paragraphs).

What players see in the Feed (one timeline with wall posts):
- **One Scout story a day**, Instagram-style: swipeable square slides, each
  one picture (or one big emoji) and one short line. Every story is about ONE
  animal or theme, and swiping goes deeper: another photo of the same animal
  with another fact.
  - Monday, "This week near you": a quick look at the week's seasonal themes
    for their home region (what's migrating, nesting or spawning), ordered by
    what they log most.
  - Tuesday, Thursday, Saturday: one of those themes in depth (what's going
    on, where to look, a fun fact), ending with "Can you find one?" and a
    camera button.
  - Wednesday, Friday, Sunday: the animal of the day (5 facts, each with a
    different photo when we have one, plus how to spot it).
- **Explorers you might like**, once a week: people to follow, each with
  their best photo, why Scout picked them ("Explores near you", "Also found a
  red fox, like you") and a Follow button. Never bots, people you already
  follow, or anyone blocked either way.
- **Moments they earn**: a new species (their photo, then 5 fun facts with
  photos, how to spot it and other players' photos), a quest done, a
  milestone, "one year ago today", and the week's best wall photos on Sunday
  evening. Anything earned on the same outing is merged into one post.
- **Weekly quests** pinned on top (three new every Monday, +10 for all three),
  also on the Quests screen above the long-term "big quests".
- On each sighting: "Scout's notes" (facts, how to spot one, more photos), and
  Scout comments one fact on wall posts.
- Profile: "Show Scout in my feed" hides Scout's posts and comments; "Let Scout
  suggest me to others" opts out of suggestions (off by default for 13–17).
  Players pick a home region after sign-up (or in Profile); "use my current
  location" only suggests one on the device. The region is stored privately
  (`profile_private`), never shown to other players.

Photos: Scout uses our credited library first, then freely licensed photos
from Wikimedia Commons (quality images first; public domain, CC0, CC BY and CC
BY-SA only; book plates, fact sheets and specimens filtered out). They're
looked up once per species and cached with its facts; tapping a credit opens
the photo's source page.

How it runs:
- `GET /api/crew/today` (animal of the day: a regional library photo, cycling
  without repeats, plus cached facts and photos), `POST /api/crew/notes` and
  `GET /api/crew/forecast` (signed-in only) call Claude (`claude-opus-5-5`, low
  effort, cached per species / per region-week; cache keys start with `kid:`, so
  older long-form content is regenerated in the new style). They work with just
  `ANTHROPIC_API_KEY`; caching across instances and Scout's comments need the
  service role key below.
- `POST /api/crew/people` (signed-in only, needs the service role key)
  suggests explorers from the last 45 days of wall posts. The app sends the
  species names in the player's journal to match finds; nothing is stored.
- Quests, milestones and the feed posts are computed on the phone.
- `GET /api/crew-daily` (Vercel Cron, daily) creates Scout's account, removes
  the retired Field Crew bot accounts (Dr. Hoot, Moss, Magpie, Kestrel, along
  with their comments), and backfills one Scout comment per recent wall post (a
  welcome on a player's first post, otherwise a fun fact).

One-time setup:
1. Supabase SQL editor: run `supabase/migrations/0007_field_crew.sql` (already
   done if the Field Crew was running), then
   `supabase/migrations/0008_scout_people.sql` (private home region + the
   suggestions opt-out; moves regions saved so far out of the public profile).
2. Vercel → Project → Settings → Environment Variables (Production), then redeploy:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → the
     **secret** key. Server-only; never put it in the app.
   - `CRON_SECRET`: any long random string.
3. Run the job once now instead of waiting for the daily run (this also removes
   the old crew accounts): `curl -H "Authorization: Bearer <CRON_SECRET>" https://clipitwildlife.app/api/crew-daily`
   (add `?dry=1` first to preview what it would remove).
4. Logs: Vercel → Logs, search `crew_`.

### g. Before submitting
- Set `CONTACT_EMAIL` and `LEGAL_ENTITY` in `src/lib/legal.ts` to your real
  support address and company name, and make sure that inbox exists.
- Deploy to Vercel so `/legal/privacy` and `/legal/terms` are live.
