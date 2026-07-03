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

## 7. Before a public store launch (not needed for friends testing)
- Privacy policy + terms (required by the store; extra-important with kids — see ROADMAP).
- Store listing: screenshots, description, age rating.
- Account deletion path (App Store requirement once you have accounts).
