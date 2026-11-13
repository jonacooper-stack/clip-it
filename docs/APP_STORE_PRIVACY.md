# App Store privacy answers ("nutrition label")

What to enter in **App Store Connect → ClipIt → App Privacy**. These match what
the app actually does and the in-app Privacy Policy (`src/lib/legal.ts`). If
you add analytics, crash reporting or ads, update both.

> **Changed in November 2026 (the cloud journal).** Sightings and a copy of
> each sighting's photo are now saved to the player's account, together with
> the place to two decimals (about a kilometre) if the player chooses to save
> places. The exact location never leaves the phone, so **Precise Location
> stays unticked**. Two boxes are new: **Gameplay Content** and **Product
> Interaction** (see the table), and the reasons for "Photos or Videos",
> "Other User Content" and "Coarse Location" have grown. Update the answers in
> App Store Connect before publishing the app update that turns this on. This
> is a change to the store listing only; it does not need a new build.

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
| User Content | **Photos or Videos** | ✅ | Photos sent for AI identification; a copy of each sighting's photo kept with the player's journal; wall posts; profile picture |
| User Content | **Gameplay Content** | ✅ (new) | The journal (species, times, points, field notes), the score and quest totals |
| User Content | **Other User Content** | ✅ | Captions, comments, reports |
| Identifiers | **User ID** | ✅ | Account ID |
| Other Data | **Other Data Types** | ✅ | Age range picked at the age question; the player's time zone |
| Location | **Coarse Location** | ✅ | The home region the player picks (e.g. "Northeast"), for Scout's posts and "explorers near you" suggestions. And, if the player saves places with their journal, where each sighting was taken, rounded to two decimals (about a kilometre). Never shown to other players |
| Location | **Precise Location** | ❌ | Not collected. The exact spot of a sighting stays on the phone; only the rounded place above is ever sent |
| Usage Data | **Product Interaction** | ✅ (new) | Daily counts per account of photos identified, scored and turned down, and of journal saves, to prevent abuse (kept about a week) |
| Diagnostics, Purchases, Financial, Health, Browsing, Search, Contacts, Sensitive Info | — | ❌ | Not collected |

> Apple counts data as "collected" when it leaves the device, and calls a
> location "precise" at three or more decimal places. The app rounds a
> sighting's place to two decimals before sending it, and the server rounds
> again, so nothing more exact is ever stored. It is not sent to the AI
> provider and never appears in wall posts or Scout's requests.
>
> Also stored, and covered by the boxes above: a yes/no on whether an
> uploaded photo carries camera details, a fingerprint of each sighting's
> photo, and the player's two choices about the journal backup.

## Step 3: For EACH ticked data type, answer:

| Question | Answer |
|---|---|
| How is it used? | **App Functionality** only (don't tick Analytics, Advertising, Personalization, etc.) |
| Is it linked to the user's identity? | **Yes** |
| Is it used for tracking? | **No** |

## Result (what users will see on the store page)
- **Data Used to Track You:** none
- **Data Linked to You:** Contact Info, Location (coarse), User Content, Identifiers, Usage Data, Other Data
- **Data Not Linked to You:** none

## Everything the cloud journal stores or sends

Keep this list in step with the code: when a column or a request field is
added, add it here, then check the policy and the label against it.

| What | Who can read it | How long | How it is removed |
|---|---|---|---|
| The photo, sent for identification | Our server and the AI provider | Not kept unless it counts as a sighting of an account that saves its journal | — |
| With that photo, only when the journal is being saved: the sighting's id, when it was taken and logged, the time zone, camera or upload, a yes/no on camera details, and the rounded place if places are saved | Our server (none of it goes to the AI provider) | Kept as part of the journal row below | With the row |
| Journal row: species, times, points, field notes, a suggested species, status, the rounded place (if saved), which wall post shares it | The player and our server | Life of the account, or until the player deletes it or erases the saved journal | Sighting deleted, journal erased, or account deleted |
| The stored copy of each sighting's photo (camera details stripped) | The player (through a short-lived link) and our server | Same | Same; the nightly clean-up finishes anything a deletion missed |
| Photo fingerprints (of journal photos and wall photos) | Our server only | Life of the account (kept on the marker of a deleted sighting); a wall photo's as long as the post | Journal photos: journal erased or account deleted. Wall photos: post or account deleted |
| Marker of a deleted sighting: its id, the species, the fingerprints, the time of deletion | The player and our server | Life of the account | Journal erased or account deleted |
| Note about a photo turned down as a copy: the account, the sighting id, the reason, and which account's photo it matched | Our server only | 90 days | Nightly clean-up; at once when either account is deleted (the matched account's ids are cleared) |
| Daily counts: identified, scored, turned down, journal saves | Our server only | About a week | Nightly clean-up; account deleted |
| Journal state: time zone, when the server began keeping the score, the two choices (backup, places), the starting baseline and allowance | The player and our server | Life of the account (the time zone is removed when the saved journal is erased) | Account deleted |
| On a wall post: a one-way code of the sighting it shares (not the sighting's id) | Every signed-in player (it tells them nothing) | As long as the post | Post or account deleted |
| A note that a deleted account's photo folder is still to be removed | Our server only | Until the nightly clean-up has done it | — |
| Server log lines: an account id, a sighting id and what happened (never photos, names or places) | Whoever can open the Vercel logs | As long as Vercel keeps logs | Not removed with the account |
| On the phone: one journal per account, with full-size photos, exact places and the server's receipts | The person using the phone | Until the account is deleted from that phone, or the app's data is reset | Account deletion, "reset app data", uninstall |

An under-13 answer at the age question deletes, for that account: the
journal rows and their markers, the stored photo copies, the journal's
fingerprints, its notes about refused photos (and its name on notes about
other players' photos), and the time zone; then it signs the account out.
What stays: the account itself, its leaderboard row and wall posts (with
their photos' fingerprints), the daily counts until they age out, and the
journal state's starting baseline and allowance (see DECISIONS.md, item 7).

## Related answers elsewhere in App Store Connect
- **Age rating questionnaire:** "Unrestricted Web Access: No"; "User-Generated
  Content: Yes" (the questionnaire asks this for social apps); everything else
  None. ClipIt is 13+ and has no under-13 path. Don't enrol in the **Kids
  Category**.
- **Sign-in required for review:** provide a demo email/password account in
  *App Review Information* that already has scored sightings, with a note:
  "Photograph a real animal, or use the demo account's journal. A photo of a
  screen or a saved picture is identified but scores nothing: that is the
  check that players took the photo themselves. The wall, comments, report
  (••• menu) and account deletion (Profile → Delete account) are all reachable
  from this account."
- **Encryption:** already declared (`ITSAppUsesNonExemptEncryption: false`).
- **Privacy manifest:** `ios.privacyManifests` in `app.json` declares the
  required-reason APIs React Native and Expo use (UserDefaults, file
  timestamps, disk space, boot time). No tracking domains.
- **Permission wording** (in `app.json`, so it only changes with a store
  build): the location prompt says "Your precise location stays private to
  you", which is still true: only the rounded place is ever sent. For the next
  store build, consider "ClipIt tags each sighting with where you saw the
  animal. The exact spot stays on your phone; other players never see it."
