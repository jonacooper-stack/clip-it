# Open decisions

*Started with the November 2026 audit; updated after your answers on 12
November. What you approved has been built (see the next section). What is
left here needs your call, a step only you can take, or costs money to
verify. Each has a recommendation.*

## Built since you decided

| You said | What happened |
|---|---|
| A separate journal per account, in the cloud | Built. Each account has its own journal on a device, saved to the account. How to turn it on: [RELEASE.md](RELEASE.md), "The cloud journal". |
| The score should be kept by the server | Built. The server identifies, scores and totals; the leaderboard shows only its numbers. |
| Ask the birth month at the age check | Built. Month and year for everyone; a birthday in the current month counts as not reached. |
| A server check on comment language, across the app | Built as a database rule on comments, captions, species names on posts and display names, generated from the app's own word list. |
| A filter for AI-made, stock and copied photos | Built: see "The photo check" below for what it catches and what it can't. |
| Compare identifier models ($5) | **Not run yet**: this workspace can't hold your Anthropic key. One click for you: decision 1. |
| Upgrade the Expo SDK | **Not started**: it needs its own branch and a store build. Decision 2. |
| Swap the black "gray" squirrel photo | Done: a clearly gray one from Central Park (Rhododendrites, CC BY-SA 4.0), credited on the credits page. The black one is retired, so stories written earlier stop showing it. |

## Needs you

### 1. Run the model comparison (about $5.50)
The identifier is nearly the whole AI bill: about $18 per 1,000 photos on
Claude Opus 4.8. Claude Haiku 5.5 would be about $0.50, Claude Sonnet 5.5
about $7–13. Whether they name species as well has not been measured
([AI_COSTS.md](AI_COSTS.md) has the detail).

- **To run it:** add your Anthropic key as a repository secret named
  `ANTHROPIC_API_KEY` (GitHub → Settings → Secrets and variables → Actions),
  merge the branch, then Actions → "Compare identifier models" → Run workflow,
  and type `run` in the confirm box. Leave it empty first to see the plan and
  cost without spending anything. The result appears on the run's summary
  page: right-species rate, speed and cost per model, how many real photos
  each wrongly refused as "not the player's own", and how many of twelve
  sample cheat pictures each refused.
- **Then:** if Haiku 5.5 or Sonnet 5.5 is within a few points of Opus on the
  right-species rate and refuses no real photos, switch with one environment
  variable (`CLAUDE_MODEL_IDENTIFY`) and tell me the numbers if you want a
  second opinion.

### 2. The Expo SDK upgrade: say go, and where
The app is on Expo SDK 52; the current one is 58. The upgrade must stay off
the branch that ships over the air: it changes native code, so it needs a
store build and a full test on a phone. One detail matters: the app's update
setting (`runtimeVersion: appVersion`) only keeps incompatible updates away
from old installs if the app version number is raised, so the upgrade has to
bump `version` in `app.json`.

- **Recommended:** after the cloud journal has shipped and settled, tell me to
  start it on a new branch (I need your OK to push to a second branch). I'd do
  it one or two SDK versions at a time, with the type checks, tests and web
  build passing at each step, and hand you a checklist for the phone test.

### 3. Have the privacy changes looked at
Saving journals to accounts changes what the app collects: the place and a
copy of the photo for each sighting, for players aged 13 and up. I updated the
in-app policy, the FAQ and the App Store notes so they say what the app now
does, and set the effective date to 12 November 2026. Existing players are
asked before their journal is uploaded.

- **You need to:** tick Precise Location in App Store Connect before the
  update goes out ([APP_STORE_PRIVACY.md](APP_STORE_PRIVACY.md)); change the
  effective date in `src/lib/legal.ts` to the day you publish; and have the
  wording read by whoever advises you on this (CONCEPT.md already plans that
  review). I wrote it to be accurate, not as legal advice.

### 4. A spending limit and email confirmation (unchanged)
In the Claude Console, set a monthly spend limit on the key's workspace. Turn
Supabase's "Confirm email" back on before any public promotion. Each account
now has daily limits, but accounts are free to create while confirmation is
off.

## The photo check: what it does, what it can't

What stops a photo scoring, in the order it is checked:

1. **What the picture shows** (in the same AI call that identifies the
   animal, about 200 extra tokens): a photo of a screen or a print, a
   screenshot, a drawing or render, a stock or photographer's watermark, an
   unmistakably computer-made image. The AI is told to say so only on clear
   evidence.
2. **Camera details on uploads:** a photo from the camera roll must carry
   what a camera saves (make, lens, exposure). A saved web image, a
   screenshot or a generated picture almost never does.
3. **The same photo twice:** each sighting's photo gets a fingerprint.
   Someone else's sighting, a photo on the wall, or one of Scout's own photos
   handed in again is refused, also when re-saved, resized or mirrored. A
   player's own photo again scores nothing.
4. **Daily brakes:** at most 100 scored sightings a day; after 10 photos
   turned down in a day, scoring pauses until tomorrow.
5. **Reports:** players can report a post as "Not their own photo".

What gets through, honestly:
- **A good AI-made image with no telltale signs**, photographed off a screen
  carefully or uploaded with faked camera details. No AI reliably detects
  these today.
- **A stock or web photo nobody has used yet**, uploaded with faked camera
  details.
- **A heavily cropped or edited copy** of someone's photo.
- Anything a modified app claims about how a photo was taken: those claims
  are hints, which is why the limits in point 4 don't depend on them.

### 5. If cheating shows up anyway
- **A review queue for refused or doubtful photos** (recommended next).
  Refusals are already recorded (`journal_refusals`) and doubts logged; there
  is no screen for you to review them or for a player to say "that was
  mine". Small to build once there is something to review.
- **A reverse image search or AI-image detector service.** These exist, cost
  per photo, and mean sending players' photos to another company (a privacy
  policy change). Worth it only if the leaderboard carries real stakes.
- **Only in-app camera photos score.** The strongest rule and the simplest,
  but it shuts out people who shoot with a real camera and upload.

### 6. Wrongly refused photos
Until there is a review queue (5), a player whose real photo is refused has
only Help & Support. With `journal_refusals` and the Vercel logs you can see
what happened; putting it right means the player taking the photo again or
you adjusting their score by hand. If refusals of real photos turn out to be
common, the switches are in RELEASE.md ("If something goes wrong").

## Still open from the audit

### 7. Under-13s who signed in with Google or Apple
An account that then answers "under 13" is signed out and blocked on the
device, but the account still exists. **Recommended:** delete it
automatically, after whoever advises you confirms.

### 8. Teens and "explorers you might like"
Suggestions are meant to be off for ages 13–17 until they turn them on, but
the database can't tell a real "yes" from the default on rows made before
the teen default existed. **Recommended:** save the age range next to that
setting so the server applies the default itself. Small.

### 9. Rapid-fire shots that aren't wildlife disappear
In a burst, a shot that can't be identified or isn't wildlife is never shown
again. **Recommended:** a short "3 shots couldn't be identified" summary
after a burst.

### 10. "Suggest an ID" goes nowhere
A suggested species is now saved with the cloud journal, but nobody reviews
it. It could feed the same review queue as decision 5.

### 11. Storage as the game grows
Each scored sighting keeps a photo copy (150–400 KB). Supabase's free plan
has 1 GB for everything. **Recommended:** check Storage monthly; move to a
paid plan (or shrink the copies) before it fills.

### 12. Smaller items, when convenient
- A Content-Security-Policy header for the web app. The web camera also
  loads a QR-code script from a public CDN (part of the camera component):
  worth removing or self-hosting when the header is added.
- The wall loads the latest 100 posts; it will need "load more" beyond that.
- Scout's nightly job writes at most six stories ahead; with all fourteen
  regions active most stories are written on first tap.
- One report hides a Scout photo for everyone (20 reports a day per
  account). Keep unless abused.
