# Shipping to the App Store — review readiness

TestFlight will accept almost anything. The public App Store won't. This is what
was blocking a submission, what changed, and the setup only you can do.

## What you still have to do

None of this is code — it's dashboard work, and the features below don't function
until it's done.

| # | Task | Where | Blocks |
|---|---|---|---|
| 1 | Set `SUPABASE_SERVICE_ROLE_KEY` | Vercel → Settings → Environment Variables | Account deletion |
| 2 | Run `supabase/migrations/0006_moderation.sql` | Supabase → SQL editor | Reporting & blocking |
| 3 | Enable the **Apple** auth provider | Supabase → Authentication → Providers | Sign in with Apple |
| 4 | Add the **Sign in with Apple** capability to the App ID | Apple Developer → Identifiers | Sign in with Apple |
| 5 | Decide the public contact address | `src/lib/contact.ts` | Privacy policy, support |
| 6 | Paste the privacy policy URL | App Store Connect → App Privacy | Submission |
| 7 | Create a reviewer demo account | App Store Connect → App Review Information | Submission |

**On (1):** the `service_role` key bypasses row-level security. It belongs only in
Vercel's server environment — never in an `EXPO_PUBLIC_*` variable, which is
inlined into the JS bundle and readable by anyone with the app.

**On (5):** the policy currently publishes `jon@getoveralls.com`. It's referenced
from one place (`src/lib/contact.ts`) so swapping it for a `support@` or `privacy@`
alias is a one-line change.

**On (6):** the URL is `https://<your-domain>/legal/privacy` — the policy ships with
the web build, so it's live as soon as the site deploys. It sits outside `(tabs)`
and is readable without an account, which is what the store checks.

## What changed, and which guideline it answers

### Account deletion — Guideline 5.1.1(v)
An app with account creation must offer deletion *inside* the app. "Delete account"
previously alerted "Coming in a later phase."

Deleting an auth user requires the service-role key, so it can't happen on the
client. `api/delete-account.ts` (Vercel, next to the identify endpoint) takes the
caller's own access token, verifies it, empties their storage folders, and deletes
the auth user. Everything else cascades: `profiles` references `auth.users` on
delete cascade, and every social table references `profiles` the same way. The
client then clears the on-device journal.

The confirmation sheet lists what goes and what stays and requires typing DELETE —
deliberate friction for the one irreversible action in the app.

### Reporting and blocking — Guideline 1.2
Any app where users see each other's content needs a report path, a block path,
and a contact route. The Community tab had posts, comments, avatars, display names
and friend requests, and none of the three.

`0006_moderation.sql` adds `content_reports` and `user_blocks`. Reports are
write-only from the client — you can file one and read your own, but nobody can
read anyone else's, so a report can't leak who reported whom.

Blocks are enforced **in the database**, not just the UI: the blanket "any
signed-in user can read" policies on `profiles`, `feed_posts` and `post_comments`
are replaced with block-aware ones, because client-side filtering alone is
cosmetic — a blocked user could still read the rows straight off the API. The
client filters too, since migrations here are applied by hand and the app has to
behave on a project where 0006 hasn't been run yet.

One `ModerationSheet` drives the flow everywhere someone else's name or content
appears. Blocking is reversible from Profile → Privacy & location → Blocked
explorers.

### Sign in with Apple — Guideline 4.8
Offering Google sign-in without an equivalent privacy-preserving option is a
rejection. Apple is exchanged directly with Supabase via `signInWithIdToken`, so
it needs none of the deep-link handling the Google flow does. The button sits
above Google (4.8 wants it at least as prominent) and renders only where the
module reports the capability is available.

Apple releases the user's name **only on the first authorization** — there's no
second chance — so it's persisted immediately.

### Under-13 signup — COPPA
The age gate bracketed under-13s and then routed them into account creation with
only a note suggesting a grown-up help. Verifiable parental consent is ROADMAP
Phase 1.5 and doesn't exist yet, so the gate now stops there: no account, nothing
stored.

**Known limitation:** this closes the *front door*. Anyone who already onboarded
as under-13 in a TestFlight build keeps their session, because the check lives at
the gate rather than on every launch. If you want that closed too, it's a check in
`app/(tabs)/_layout.tsx` against the stored age bracket — worth doing before the
app is public, and it will sign out any existing child testers.

### Placeholder features — Guideline 2.1
"Privacy & location" is a real screen now. It explains rather than offering
switches, because for most of this the honest answer is "it never leaves your
phone", and inventing toggles that control nothing would be worse than saying so.
"Manage child profile" was removed rather than stubbed — child profiles don't
exist and under-13 signup is closed. The dev reset is behind `__DEV__`.

## Two things to decide before you submit

**iPad.** `app.json` sets `"supportsTablet": true`, so Apple will require iPad
screenshots and will test on an iPad. If ClipIt isn't genuinely iPad-ready, set it
to `false` — it removes real review surface for a one-word change.

**This needs a full build, not an OTA.** Sign in with Apple adds a native module
and an entitlement, so it bumps the runtime version: Actions → "EAS Build" → `ios`
/ `production`. An OTA update can't deliver it, and won't be offered to the old
build (safe by design — it can't break what's installed).
