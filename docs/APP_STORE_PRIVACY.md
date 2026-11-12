# App Store privacy answers ("nutrition label")

What to enter in **App Store Connect → ClipIt → App Privacy**. These match what
the app actually does and the in-app Privacy Policy (`src/lib/legal.ts`). If
you add analytics, crash reporting or ads, update both.

> **Changed in November 2026 (the cloud journal).** Sightings, a copy of each
> sighting's photo and the place it was taken are now saved to the player's
> account. **Precise Location must now be ticked** (see the table), and the
> "Photos or Videos" reason has grown. Update the answers in App Store Connect
> before publishing the app update that turns this on. This is a change to the
> store listing only; it does not need a new build.

**Privacy Policy URL:** `https://clipitwildlife.app/legal/privacy`
(the same screen as Profile → Privacy policy in the app). Deploy this branch to
Vercel first so the page is live.

## Step 1: "Do you or your third-party partners collect data from this app?"
**Yes.**

## Step 2: Data types to tick

| Category | Data type | Tick? | Why |
|---|---|---|---|
| Contact Info | **Email Address** | ✅ | Account sign-in |
| Contact Info | **Name** | ✅ | Display name; name from Apple/Google sign-in |
| User Content | **Photos or Videos** | ✅ | Photos sent for AI identification; a copy of each sighting's photo kept in the player's private journal; wall posts; profile picture |
| User Content | **Other User Content** | ✅ | Captions, comments, reports; the journal (species, times, field notes) |
| Identifiers | **User ID** | ✅ | Account ID |
| Other Data | **Other Data Types** | ✅ | Age range picked at sign-up |
| Location | **Coarse Location** | ✅ | The home region the player picks (e.g. "Northeast") is saved privately on their account for Scout's daily posts about wildlife near them and "explorers near you" suggestions (never shown to other players) |
| Location | **Precise Location** | ✅ | Where each sighting was taken is saved with the journal in the player's account (private to them; never shown to other players or put in wall posts). The region suggestion is still computed on the phone |
| Usage Data, Diagnostics, Purchases, Financial, Health, Browsing, Search, Contacts, Sensitive Info | — | ❌ | Not collected |

> Apple counts data as "collected" when it leaves the device. The capture
> location now goes to the server with the photo and is stored with the
> sighting, so **Precise Location** is ticked: App Functionality → Linked →
> No tracking. It is not sent to the AI provider and never appears in wall
> posts or Scout's requests. The player-chosen home region is coarse location.
>
> Also stored, and covered by the categories above: the player's time zone
> (for weekly quests), a yes/no on whether an uploaded photo carries camera
> details, a fingerprint of each sighting's photo, and daily counts of
> identifications (kept a week).

## Step 3: For EACH ticked data type, answer:

| Question | Answer |
|---|---|
| How is it used? | **App Functionality** only (don't tick Analytics, Advertising, Personalization, etc.) |
| Is it linked to the user's identity? | **Yes** |
| Is it used for tracking? | **No** |

## Result (what users will see on the store page)
- **Data Used to Track You:** none
- **Data Linked to You:** Contact Info, Location (precise and coarse), User Content, Identifiers, Other Data
- **Data Not Linked to You:** none

## Related answers elsewhere in App Store Connect
- **Age rating questionnaire:** "Unrestricted Web Access: No"; "User-Generated
  Content: Yes" (the questionnaire asks this for social apps); everything else
  None. ClipIt has an under-13 path, but don't enrol in the **Kids Category**
  unless you're ready for its extra rules (no third-party sign-in, which would
  mean removing Google and Apple sign-in for kids).
- **Sign-in required for review:** provide a demo email/password account in
  *App Review Information*, with a note: "Point the camera at any animal photo;
  the wall, comments, report (••• menu) and account deletion (Profile → Delete
  account) are all reachable from this account."
- **Encryption:** already declared (`ITSAppUsesNonExemptEncryption: false`).
- **Privacy manifest:** `ios.privacyManifests` in `app.json` declares the
  required-reason APIs React Native and Expo use (UserDefaults, file
  timestamps, disk space, boot time). No tracking domains.
