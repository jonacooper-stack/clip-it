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

Before the first release on Google Play, fill in Play's **Data safety** form
from [APP_STORE_PRIVACY.md](APP_STORE_PRIVACY.md) (photos, approximate
location, the journal). Play draws the line between approximate and precise
location differently from Apple, so check its wording against "two decimals,
about a kilometre".

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
- **Two Scout stories a day**, Instagram-style: swipeable square slides, each
  one picture (or one big emoji) and one short line, all about ONE animal or
  theme.
  - Morning (7am), "near you": Monday is a quick look at the week's seasonal
    themes for the player's home region (tap any slide for its story);
    Tuesday to Sunday dig into one theme each (what's going on, where to look,
    a fun fact), ending with "Can you find one?" and a camera button.
  - Afternoon (2pm): the animal of the day (5 facts, a different photo on
    most slides, how to spot it).
- **Read the story**: tap a post (or its "Read the story" button) for a
  full-screen story, Instagram Stories style, 6 short pages: why they do it,
  when, where to look and listen, a wow fact, how to be a good explorer, and
  a mission. Tap right for the next page, left to go back.
- **Explorers you might like**, once a week: people to follow, each with
  their best photo, why Scout picked them and a Follow button. Never bots,
  people you already follow, or anyone blocked either way.
- **Moments they earn**: a new species (their photo, fun facts with photos,
  how to spot it, other players' photos, and its story), a quest done, a
  milestone, "one year ago today", and the week's best wall photos on Sunday
  evening. Anything earned on the same outing is merged into one post.
- **Weekly quests** pinned on top (three new every Monday, +10 for all three),
  also on the Quests screen above the long-term "big quests".
- On each sighting: "Scout's notes" (facts, how to spot one, more photos), and
  Scout comments one fact on wall posts.
- Profile: "Show Scout in my feed" hides Scout's posts and comments; "Let Scout
  suggest me to others" opts out of suggestions (off by default for 13–17).
  The home region is stored privately (`profile_private`).

Photos, and how wrong ones are caught:
- Our curated library (`site/img/library`, credits on `/credits.html`; `/credits`
  is rewritten to it) was audited
  photo by photo; wrong or unsuitable ones were replaced or retired (retired
  ones are blocked in `api/_lib/photoFlags.ts`, even in cached content).
- Extra photos come from Wikimedia Commons (quality images first; public
  domain, CC0, CC BY and CC BY-SA only). Every Commons photo is downloaded and
  checked by Claude before use: it must clearly show a live animal of that
  species (no diagrams, skeletons, specimens, devices, captive birds on a
  glove, nothing gory). Checked photos are cached per species; if the check
  can't run, no unchecked photo is used and it's retried in an hour.
- Every Scout photo has a small flag ("Wrong photo?"). One report hides it
  for everyone, everywhere (feed, stories, sighting notes) and it's never
  picked again. Review reports in the Supabase SQL editor:
  `select url, species, context, reason, created_at from crew_photo_flags order by created_at desc;`
  Restore one that was fine: `update crew_photo_flags set cleared = true where url = '…';`
- Tapping a photo credit opens its source page (author and license).

How it runs:
- `GET /api/crew/today` (animal of the day: a regional library photo, cycling
  without repeats, plus cached facts and photos), `POST /api/crew/notes` and
  `GET /api/crew/forecast` (signed-in only) call Claude (low effort, cached per
  species / per region-week; cache keys start with `kid:`, so older long-form
  content is regenerated in the new style). Which model does which job, and
  what each costs, is in [AI_COSTS.md](AI_COSTS.md). They work with just
  `ANTHROPIC_API_KEY`; caching across instances, Scout's comments and the
  per-player daily limits need the service role key below.
- `POST /api/crew/story` (signed-in only) writes a story once per theme and
  week, or per species and month, cached in `crew_stories`;
  `POST /api/crew/flag-photo` stores "Wrong photo?" reports.
- `POST /api/crew/people` (signed-in only, needs the service role key)
  suggests explorers from the last 45 days of wall posts. The app sends the
  species names in the player's journal to match finds; nothing is stored.
- Quests, milestones and the feed posts are computed on the phone.
- `GET /api/crew-daily` (Vercel Cron, daily) creates Scout's account, removes
  the retired Field Crew bot accounts (Dr. Hoot, Moss, Magpie, Kestrel, along
  with their comments), backfills one Scout comment per recent wall post (a
  welcome on a player's first post, otherwise a fun fact), and writes the
  upcoming stories ahead of time (this week's themes, today's and tomorrow's
  animal of the day) so they open instantly.

One-time setup:
1. Supabase SQL editor: run `supabase/migrations/0007_field_crew.sql` (already
   done if the Field Crew was running), then
   `supabase/migrations/0008_scout_people.sql` (private home region + the
   suggestions opt-out; moves regions saved so far out of the public profile),
   then `supabase/migrations/0009_scout_stories_and_photo_reports.sql`
   (story cache + photo reports).
2. Vercel → Project → Settings → Environment Variables (Production), then redeploy:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → the
     **secret** key. Server-only; never put it in the app.
   - `CRON_SECRET`: any long random string.
3. Run the job once now instead of waiting for the daily run (this also removes
   the old crew accounts): `curl -H "Authorization: Bearer <CRON_SECRET>" https://clipitwildlife.app/api/crew-daily`
   (add `?dry=1` first to preview what it would remove).
4. Logs: Vercel → Logs, search `crew_`.

### g. After the November 2026 audit: three steps
The audit's fixes are in the code; these three steps turn them all on. They can
be done in any order, and nothing breaks in between.

1. **Run `supabase/migrations/0010_hardening.sql`** in the Supabase SQL editor.
   It closes several gaps in the database rules (a friend request could be
   created already accepted; wall posts could link photos on any server;
   blocking wasn't enforced by the database) and adds the table the server
   counts daily limits in. Rows already in the tables are left alone. Safe to
   run more than once. Until it runs, the daily limits simply don't apply.
2. **Run the "EAS Update (OTA)" workflow** (channel `production`) once Vercel
   has deployed, so installed builds get the app-side fixes (the blank story
   screen, the capture and feed fixes). Everything in the audit is
   JavaScript-only: no new build is needed.
3. **Decide the model for the photo identifier** with
   `npm run eval:identify` (see [AI_COSTS.md](AI_COSTS.md)), then set
   `CLAUDE_MODEL_IDENTIFY` in Vercel if you switch.

Day to day:
- `npm run check` runs the type checks and unit tests; `npm run test:db` tests
  the database rules against a local Postgres, and then runs the server's
  journal code against those same tables. CI runs both, plus the web build,
  on every pull request.
- Vercel → Logs: `claude_usage` (tokens per call), `identify_failure`,
  `crew_`.
- The open product decisions from the audit are in
  [DECISIONS.md](DECISIONS.md).

### h. The cloud journal (November 2026): what it is and how to turn it on
Journals now belong to accounts and can be saved to them; the server works
out every score; photos that aren't a player's own don't score; and the
database checks comments, captions and names for blocked language. All of it
is JavaScript, SQL and server code: **no new build is needed.**

Two rules run through all of it. Nothing from a journal is saved to an
account until that account has answered the age question (13 and up) and
said yes to having its journal saved. And where a sighting was taken is
saved only if the player chooses, and then only to about a kilometre: the
exact spot never leaves the phone.

Do these in one sitting, in this order. Each step is safe on its own (nothing
breaks if you stop in between), but players only get the whole thing once all
are done.

1. **Supabase → SQL editor: run `0010_hardening.sql` (if you haven't) and then
   `0011_cloud_journal.sql`.** 0011 creates the journal tables, the private
   photo bucket and the rules, and takes a one-time snapshot: every account
   that exists at that moment gets a *baseline* (its leaderboard score, at
   most 10,000) and an *allowance* for sightings scored on the phone (500
   points per day the account has existed, at most 20,000). Safe to run more
   than once; the snapshot is only taken the first time.
2. **Vercel → Settings → Environment Variables: add `RECEIPT_SECRET`** (any
   long random string). Optional but recommended: without it the server signs
   its receipts with a key derived from the Supabase key, and receipts
   waiting on phones stop working if that key is ever changed. Check that
   `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are set (they are needed
   already for Scout).
3. **Merge the branch.** Vercel deploys the server and the web app.
4. **App Store Connect → App Privacy: tick Gameplay Content and Product
   Interaction**, and update the reasons for Photos and Coarse Location
   ([APP_STORE_PRIVACY.md](APP_STORE_PRIVACY.md) has the exact entries).
   Precise Location stays unticked: only a rounded place is ever sent. The
   label must match before the update goes out. This is a listing change; it
   needs no build and no review.
5. **Run the "EAS Update (OTA)" workflow** (channel `production`). Phones
   download it on their next launch and use it from the launch after.
6. **Vercel → Cron Jobs → `/api/crew-daily` → Run** (or wait for tonight's
   run). The first run starts the 30-day clock (below) and fingerprints the
   photos already on the wall, about a hundred per run: press Run again until
   the result shows `"wallPrints": 0`. Until the wall photos are
   fingerprinted, a photo copied from the wall could be scored by someone
   else.

**What players see.**
- *The age question, for some.* An account that never answered it (one made
  through Google or Apple sign-in) answers it before going further, as before.
  New: an account filed as 13–17 by the earlier version of the question, which
  asked the year only, answers once more with the month. (The year alone could
  let in a 12-year-old who turns 13 later in the year.) An under-13 answer
  signs the account out and deletes anything saved to its journal; the log
  shows `journal_erased` with `why: under13`. The account itself still exists:
  see DECISIONS.md.
- *"Save your journal to your account?"* Every account from before this update
  is asked once, on whichever device it next signs in, before anything is
  uploaded. Yes: their sightings go up (photos follow on Wi-Fi) and their score
  is kept by the server from then on. Not now: nothing is saved to their
  account, and Profile → Journal backup lets them turn it on later. Once the
  30 days (below) are up, sightings that aren't saved stop counting on the
  leaderboard. The answer is kept on the account, so their other devices
  follow it without asking again. An account created in the updated app isn't
  asked: it signed up under the new privacy policy.
- *Two controls in Profile.* "Save places with my journal": on, the place of
  each sighting is saved to about a kilometre; off, places stay on the phone
  and the ones already saved are removed. It starts off for ages 13–17. For an
  adult it is on once they have let the app use their location (and comes on
  by itself when they do, unless they have set the switch themselves). "Turn off journal backup"
  stops saving, and offers to delete what was saved.

**The 30-day clock.** App versions from before this change score sightings
on the phone and report their own totals. That stays accepted for 30 days
from the first nightly run after the deploy, and so does the upload of each
player's existing journal (up to the allowance from step 1). After that only
sightings the server identified itself count, and an account that never
updated goes back to its baseline. A sighting that arrives too late is not
lost: while its photo is on the phone, the updated app sends it through the
identifier again and it counts from then on. To change the date:

```sql
insert into public.app_settings (key, value)
values ('legacy_import_until', to_jsonb(now() + interval '30 days'))
on conflict (key) do update set value = excluded.value, updated_at = now();
```

**New installs.** A fresh install runs the code it shipped with for its first
session, and gets the update from its second launch. Those first sightings
are picked up by the same re-check. The next time you make a store build for
any reason, the new code ships inside it and this stops mattering.

**Storage.** Each sighting that counts keeps a copy of its photo (about
150–400 KB) in the private `journal-photos` bucket. Supabase's free plan
includes 1 GB across all buckets, which is roughly 3,000–6,000 photos
together with wall photos and avatars. Watch Storage in the Supabase
dashboard as the game grows.

**If something goes wrong.** Each of these is reversible:
- Stop recording and syncing: set `JOURNAL_SYNC=off` in Vercel, then
  **Deployments → Redeploy** (a changed variable only reaches a new
  deployment). The app carries on scoring on the phone and syncs again when
  it is switched back on.
- Stop refusing camera-roll uploads without camera details: `IMPORT_CHECK=off`,
  then Redeploy.
- A database rule misbehaving: switch that one trigger off (and on again with
  `enable trigger`):

```sql
alter table public.profiles      disable trigger profiles_protect_score;
alter table public.profiles      disable trigger profiles_clean_display_name;
alter table public.feed_posts    disable trigger feed_posts_from_journal;
alter table public.feed_posts    disable trigger feed_posts_language;
alter table public.post_comments disable trigger post_comments_language;
```

**Where to look.**
- Vercel → Logs: `identify_failure` with reason `not_own_photo` (a photo was
  turned down, and `why`), `picture_doubt`, `journal_record_failed`,
  `journal_sync_failure`, `journal_erased` (a player had their saved journal
  deleted, or answered under 13), `legacy_window_set`, `crew_daily_run` (its
  `journal` part: photos of deleted accounts and sightings removed, wall
  photos fingerprinted).
- Supabase → Table editor: `journal_refusals` lists every photo turned down as
  a copy in the last 90 days, with what it matched. If a player says a refusal
  was wrong, this is where to check.
- A player says their journal isn't saving: `journal_state` has their two
  choices (`backup` is yes, no, or empty for "never answered"; `save_places`),
  and `erased_at` if they had the saved journal deleted. The server stores
  nothing unless `backup` is yes.
- A player's score looks wrong: `journal_state` has their baseline, allowance
  and what is still carried over; `journal_sightings` has every row with its
  points and whether the server identified it (`verified`).

### i. Before submitting
- Set `CONTACT_EMAIL` and `LEGAL_ENTITY` in `src/lib/legal.ts` to your real
  support address and company name, and make sure that inbox exists.
- Deploy to Vercel so `/legal/privacy` and `/legal/terms` are live.
