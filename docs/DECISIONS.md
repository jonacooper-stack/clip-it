# Open decisions

*From the November 2026 audit. Everything that was a bug, a security gap or a
safe improvement was fixed directly (see the commit history and
[RELEASE.md](RELEASE.md) → "After the November 2026 audit"). What is left here
changes how the product works, costs money to verify, or needs your call
between real alternatives. Each has a recommendation; none blocks shipping the
fixes.*

## Decide soon

### 1. Which model identifies photos?
The identifier is nearly the whole AI bill: about $16 per 1,000 photos on
Claude Opus 4.8. Claude Haiku 5.5 would be about $0.50, Claude Sonnet 5.5 about
$7–11. Nobody has measured whether the cheaper models name species as well.

- **Recommended:** approve about $5 of API spend to run
  `npm run eval:identify -- --yes` (99 labelled photos × 4 models). If Haiku 5.5
  or Sonnet 5.5 is within a few points of Opus on the right-species rate, switch
  with one environment variable (`CLAUDE_MODEL_IDENTIFY`) and re-check on a few
  dozen real player photos.
- Alternative: stay on Opus 4.8. Nothing to do; costs as above.
- Later option if Haiku is close but not equal: answer with Haiku, and re-ask a
  larger model only when Haiku says it is unsure. Needs building.

Details and all the numbers: [AI_COSTS.md](AI_COSTS.md).

### 2. Put a spending limit on the Anthropic key
Not a code change. Anyone can create an account, and each account now has a
daily allowance, but there is no ceiling across all accounts. In the Claude
Console, set a monthly spend limit on the workspace the key belongs to. Also
turn Supabase's "Confirm email" back on before a public launch (RELEASE.md
already says so): with it off, accounts are free to mass-produce.

- **Recommended:** do both before any public promotion.

### 3. The journal only exists on the phone
Two consequences today:
- A reinstall or a new phone starts from an empty journal.
- If one person signs out and another signs in on the same device, the second
  person sees the first person's journal, photos and locations, and those
  points are synced to the second person's leaderboard row.

Options:
- **(a) Recommended now:** keep a separate journal per account on the device.
  Small change, fixes the mix-up, loses nothing.
- (b) Clear the journal on sign-out. Simple, but it deletes the only copy.
- (c) Store journals in the cloud (the "journal cloud sync" item already on the
  roadmap). The real fix for both problems; goes with decision 4.

### 4. Scores are reported by the app
The leaderboard shows whatever points each app reports. The database now
refuses negative or absurd totals, but a modified app can still claim a
plausible high score. The server sees every identification and could keep the
score itself.

- **Recommended:** build server-side scoring together with the cloud journal
  (3c) before the leaderboard carries prizes or public bragging rights. About a
  week of work; the scoring code already exists in two places and would become
  one.
- Alternative: leave it while the game is among friends.

### 5. Under-13s
- The age check asks for a birth year only, so anyone turning 13 at any point
  this year is let in while still 12. Options: ask for the month as well when
  the year is the borderline one (**recommended**), or treat the whole
  borderline year as under 13.
- An account made through Google or Apple that then answers "under 13" is
  signed out and blocked on the device, but the account still exists. Deleting
  it automatically is the usual practice. **Recommended:** delete it, after
  counsel confirms (CONCEPT.md already plans that review).

### 6. One sentence for the privacy policy
Once migration 0010 is run, the server keeps a daily count per account of
photos identified, new Scout content requested and photos reported, for seven
days, to enforce the daily limits. The policy doesn't mention it. Suggested
addition under "Photos and identification":

> To prevent abuse, we keep a daily count of how many photos your account has
> had identified. Counts are deleted after a week.

Your call whether that also means updating the effective date and the App
Store privacy answers (docs/APP_STORE_PRIVACY.md). I left the legal text alone.

## Community safety

### 7. Comments are only language-filtered inside the app
The word filter runs in the app before posting. A modified app can post
anything; reports and your review are the only backstop. (Scout no longer
repeats unchecked text, and length limits are now enforced by the database.)

- **Recommended:** send comments and captions through a small server endpoint
  that applies the same filter. Optionally add an AI check there with Claude
  Haiku 5.5, at roughly a hundredth of a cent per comment.
- Cheaper alternative: the same word list as a database trigger. Blunt, and the
  list would then live in two places.

### 8. Teens and "explorers you might like"
Suggestions are meant to be off for ages 13–17 until they turn them on. The
server now only suggests players who have a saved "yes". But the earlier
migration (0008) created rows that default to "yes" for everyone, and a teen's
row stays that way until their app has saved the teen default, so the server
cannot tell those apart from a real yes.

- **Recommended:** save the age range next to that setting so the server
  applies the teen default itself. Small change (one column, one line in the
  app).
- Alternative: reset everyone to "no" once. Adults would have to switch it back
  on by hand.

### 9. One report hides a Scout photo for everyone
Deliberate, and right for a young audience. The risk is one account hiding
many photos; each account is now limited to 20 reports a day.

- **Recommended:** keep as is. Revisit if it is abused (for example, require
  two reports for the hand-checked library photos).

## Product

### 10. Rapid-fire shots that aren't wildlife disappear
In a burst, a shot the AI can't identify, or identifies as a pet or person, is
never shown again: it isn't in the journal and nothing says why.

- **Recommended:** after a burst, show a short "3 shots couldn't be identified"
  summary with the photos and a way to retry or discard them.

### 11. "Suggest an ID" goes nowhere
Suggesting a different species marks the sighting on the phone only. There is
no review queue behind it. (The label said "In review"; it now says
"Disputed".)

- Options: save suggestions to a table you can review (small); ask the AI again
  with the player's suggestion (one more identification per dispute); or leave
  it as a personal note.

### 12. Scout's eastern gray squirrel is black
The library photo for "Eastern gray squirrel" is a melanistic (all-black)
individual. It is the right species, but it reads as a mistake next to the
name. Swapping it for a gray one is a small change if you agree; say the word.

### 13. Is the web version a product or a demo?
On the web, journal photos don't survive a page reload (the browser can't keep
them the way the phone does) and there is no offline queue. Fine for a demo. If
the web app is meant for real use, it needs photo storage, which decision 3c
would also provide.

## Engineering

### 14. Expo SDK 52 is six versions behind
The app is on Expo SDK 52 (React Native 0.76); the current SDK is 58 (0.88).
Nothing is broken because of it today, but security fixes stop reaching old
SDKs, app store build requirements move forward every year, and one of the
bugs fixed in this audit needed a workaround for a router bug in this version.
An upgrade is a new native build and a full test pass, not an over-the-air
update.

- **Recommended:** schedule it as its own piece of work in the next couple of
  months, one or two SDK versions at a time.

### 15. Stories written ahead of time
The nightly job writes at most six stories. With a few active regions that
covers the next day; with all fourteen, most stories would be written when the
first player taps (a wait of ten seconds or more, now with a proper loading
screen).

- Options: raise the cap or run the job more often (depends on the Vercel
  plan), or use a faster model for Scout's writing (ties in with decision 1).
  Not urgent at today's size.

### 16. Smaller items, when convenient
- A Content-Security-Policy header for the web app. The other security headers
  are in place; this one needs testing against sign-in, fonts and photo hosts.
- The wall loads the latest 100 posts. It scrolls efficiently now, but will
  need "load more" once the wall is busier than that.
- The Supabase function `identify-and-score` is unfinished scaffolding. It now
  checks who is calling, but should either be completed as part of decision 4
  or removed.
