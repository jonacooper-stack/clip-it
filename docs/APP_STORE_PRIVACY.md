# App Store privacy answers ("nutrition label")

What to enter in **App Store Connect → ClipIt → App Privacy**. These match what
the app actually does today and the in-app Privacy Policy
(`src/lib/legal.ts`). If you add analytics, crash reporting, ads, or start
syncing sightings/locations to the server, update both.

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
| User Content | **Photos or Videos** | ✅ | Photos sent for AI identification; wall posts; profile picture |
| User Content | **Other User Content** | ✅ | Captions, comments, reports |
| Identifiers | **User ID** | ✅ | Account ID |
| Other Data | **Other Data Types** | ✅ | Age range picked at sign-up |
| Location | Precise / Coarse Location | ❌ | Location stays on the device (journal only); it's never sent to a server |
| Usage Data, Diagnostics, Purchases, Financial, Health, Browsing, Search, Contacts, Sensitive Info | — | ❌ | Not collected |

> Apple counts data as "collected" only when it leaves the device. The capture
> location is written to the on-device journal and is **not** included in the
> identify request or wall posts, so Location is not ticked. If you later sync
> sightings (with coordinates) to Supabase or build the sightings map, tick
> **Precise Location** → App Functionality → Linked → No tracking.

## Step 3: For EACH ticked data type, answer:

| Question | Answer |
|---|---|
| How is it used? | **App Functionality** only (don't tick Analytics, Advertising, Personalization, etc.) |
| Is it linked to the user's identity? | **Yes** |
| Is it used for tracking? | **No** |

## Result (what users will see on the store page)
- **Data Used to Track You:** none
- **Data Linked to You:** Contact Info, User Content, Identifiers, Other Data
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
