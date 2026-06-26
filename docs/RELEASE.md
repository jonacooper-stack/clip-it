# Shipping Clip-It as a native app

This is the "fast path": get a real, installable app onto friends' phones, keep
the web version, and keep iterating quickly via over-the-air (OTA) updates. The
app config (`app.json`, `eas.json`, icons) is already done — the steps below are
the parts that need **your** accounts and run on Expo's servers.

## 0. Accounts you'll need (one time)
- **Expo account** — free, https://expo.dev (this is what runs the builds).
- **Apple Developer Program** — $99/yr, https://developer.apple.com (for iOS / TestFlight).
- **Google Play Console** — $25 once, https://play.google.com/console (for Android).

You can start with **Android only** (cheaper, no review wait) to share something today,
and add iOS when ready.

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
IDs (`com.clipit.app`), and a `runtimeVersion` policy ready to go.

> Want a different bundle id (e.g. `com.getoveralls.clipit`)? Change `ios.bundleIdentifier`
> and `android.package` in `app.json` **before** the first build — it can't change after
> you submit to a store.

## 2. Build something friends can install
`eas.json` defines a **preview** profile (internal distribution = shareable install link).

**Android (fastest — a direct APK link, no review):**
```bash
eas build -p android --profile preview
```
EAS prints an install URL / QR code when it finishes. Send it to friends — they tap and install.

**iOS (TestFlight — invite up to 10,000 testers):**
```bash
eas build -p ios --profile preview
eas submit -p ios --latest        # uploads the build to App Store Connect → TestFlight
```
Then add testers in App Store Connect → TestFlight. (First iOS build will prompt to
create signing credentials — let EAS manage them.)

## 3. Iterate fast — OTA updates (no rebuild, no store review)
For any JavaScript/UI/content change (which is almost everything), push it instantly
to installed apps:
```bash
eas update --branch preview -m "what changed"
```
Installed apps pick it up on next launch. This keeps the same speed we have now.

**Automated:** `.github/workflows/eas-update.yml` runs this on every push once you add an
`EXPO_TOKEN` repo secret (Expo dashboard → Account settings → Access tokens). Until then
it safely skips.

### What needs a new build (occasional) vs. an OTA update (almost always)
| New build + store | OTA update (`eas update`) |
|---|---|
| New native module / Expo SDK bump | JS/TS code, screens, logic |
| Icon, splash, permissions, app name | Styles, the design refresh |
| Push notifications, in-app purchases, ads | Copy, images, bug fixes |

Rule of thumb: if you didn't change anything under `ios.`/`android.`/`plugins` in
`app.json` and didn't add a native dependency, an OTA update is all you need.

## 4. The web version keeps shipping
Nothing changes — `npx expo export -p web` still builds the web app and Vercel deploys it
from the same codebase. Native and web run from one project.

## 5. Before a public store launch (not needed for friends testing)
- Privacy policy + terms (required by both stores; extra-important with kids — see ROADMAP).
- Store listing: screenshots, description, age rating.
- Account deletion path (App Store requirement once you have accounts).
