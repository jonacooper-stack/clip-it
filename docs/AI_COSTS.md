# What the AI costs, and how to change it

*Every Claude call the server makes, what each one costs, what was changed in the
November 2026 audit, what the cloud journal and the photo check added, and how
to pick a cheaper or faster model safely.*

## The short version

- **Almost all of the bill is the photo identifier.** It runs on every capture.
  Everything Scout writes is produced once and shared by all players, so it
  costs a few dollars a week at most, however many players there are.
- The identifier runs on Claude Opus 4.8 at about **$18 per 1,000 photos**
  (it was about $22 for portrait photos before the image-size fix; the photo
  check added in November costs about $1.50 of the $18).
- Claude Haiku 5.5 would be about **$0.50 per 1,000 photos**, and Claude
  Sonnet 5.5 about $7–13. Whether they name species as well as Opus is not
  known yet: the comparison measures it for about $5.50 (see "The identifier:
  measure before switching").
- Switching is one environment variable per job. No code change.
- The most one account can cost in a day is its 300 identifications: about
  $5.40 on Opus 4.8.

Prices and image-cost rules were read from Anthropic's pricing, vision and
cost-optimization pages on 2026-11-12. The per-call costs below are
**estimates from the code**, not measurements: until this audit the server
did not log token usage. It does now (see "Measuring it for real").

## The five jobs

| Job | When it runs | Model today | Sent | Returned | About, per call |
|---|---|---|---|---|---|
| `identify` | Every capture | Opus 4.8 | ~800 tokens of instructions + the photo (1,610 tokens at 1280×960) | ~230 tokens of JSON | $0.018 |
| `facts` | Once per species, ever | Opus 5.5, low effort | ~350 tokens | 5 facts + a tip | $0.01 |
| `photo_check` | Once per species (later, only for photos not seen before) | Opus 5.5, low effort | up to 8 Wikimedia photos at 960px (~1,000 tokens each) | ok / not ok per photo | $0.04 |
| `forecast` | Once per region per week (14 regions) | Opus 5.5, low effort | ~800 tokens | 6 seasonal themes | $0.02 |
| `story` | Once per theme per region-week; once per species per month | Opus 5.5, low effort | ~450 tokens | 6 short pages | $0.02 |

Scout's whole weekly output with all 14 regions active is roughly $2–3. The
identifier is the only job that grows with use: 1,000 captures is about $18,
10,000 about $180.

An image costs one token per 28×28 pixel block, so cost follows pixel area,
not file size. That is why the size of the copy sent to the AI
(`src/lib/imageSize.ts`, longest side 1280) is the main cost control.

## What the audit changed (no quality trade-off)

1. **Portrait photos were sent a third larger than intended.** The resize
   capped the width, not the longest side, so a portrait phone photo went out
   at 1280×1707 (2,806 tokens) instead of 960×1280 (1,610). Small photos were
   also upscaled. Fixed: about 43% fewer image tokens on portrait captures.
2. **The same Wikimedia photos were re-checked every three days** for any
   species with fewer than three photos, forever. Each photo is now judged
   once; a retry only looks at photos it has not seen.
3. **A capture that kept failing was re-sent every 20 seconds, indefinitely.**
   Retries now back off (30 seconds to 6 hours) and stop after 8 tries.
4. **Slow answers were paid for twice.** The app gave up after 20 seconds while
   the server could run for 30, then the app re-sent the photo. The app now
   waits slightly longer than the server allows itself.
5. **Anyone with an account could make the server write unlimited new
   content** (a new "species" per request). Names are now checked, theme
   stories must match a theme Scout really posted, and each player has a daily
   allowance (`DAILY_IDENTIFY_LIMIT`, `DAILY_GENERATE_LIMIT`,
   `DAILY_FLAG_LIMIT`; defaults 300 / 60 / 20).
6. **Species stories were written for the first reader's region and then
   served to every region.** They are now written region-neutral (same single
   call, correct for everyone).
7. The identifier's fixed instructions are marked cacheable. This does nothing
   on Opus 4.8 (the prompt is under its 1,024-token minimum) and trims the
   cost of bursts on the 5.x models (512-token minimum).
8. One line of token usage is logged per call.

## What the cloud journal and the photo check added

1. **The photo check rides along in the identification.** The same call that
   names the animal now also says what kind of picture it is (a real scene, a
   screen, a print, a screenshot, artwork), whether it carries a stock
   watermark and whether it looks computer-made. That is about 200 more
   tokens of instructions and 25 more of answer: roughly $0.0015 per photo on
   Opus 4.8, and no second call.
2. **Everything else in the photo check is ordinary code**, with no AI cost:
   the photo fingerprints and the search for the same photo elsewhere, the
   camera-details check on uploads, and the daily brakes.
3. **Saving and restoring journals never calls a model.**
   `/api/journal/sync` only reads and writes the database.
4. **Sightings scored by an older version of the app are identified once
   more.** A phone that still runs an old version scores sightings itself; the
   server doesn't count those beyond each account's starting allowance. Once
   the phone has the new version, it sends the photo of each such sighting to
   the server to be identified properly (three per sync, only while the photo
   is still on the phone). Each one is a normal identification, once. The
   same happens for a player who deletes the journal saved to their account
   and later turns the backup on again.
5. **Daily brakes** (`DAILY_SCORE_LIMIT` 100, `DAILY_REFUSED_LIMIT` 10,
   `DAILY_JOURNAL_LIMIT` 600) limit scoring and syncing, not AI spend: a photo
   over the scoring limit is still identified. The spend limit is still
   `DAILY_IDENTIFY_LIMIT`.

## Choosing models

Set these in Vercel → Settings → Environment Variables, then redeploy:

| Variable | Job | Default |
|---|---|---|
| `CLAUDE_MODEL_IDENTIFY` | `identify` | `claude-opus-4-8` |
| `CLAUDE_MODEL_TEXT` | `facts`, `forecast`, `story` | `claude-opus-5-5` |
| `CLAUDE_MODEL_PHOTO_CHECK` | `photo_check` | `claude-opus-5-5` |

`api/_lib/claude.ts` knows how each model must be asked (effort level,
fallback on a declined request), so any of `claude-opus-5-5`,
`claude-opus-4-8`, `claude-sonnet-5-5` and `claude-haiku-5-5` works as a value.

### The identifier: measure before switching

Estimated cost per 1,000 photos at the current image size:

| Model | Per 1,000 photos | Notes |
|---|---|---|
| Opus 4.8 (today) | about $18 | No thinking step, so it answers quickly |
| Opus 5.5, low effort | about $15–26 | Newer and cheaper per token, but it always thinks first, which adds output |
| Sonnet 5.5, low effort | about $7–13 | |
| Haiku 5.5, low effort | about $0.40–0.65 | Anthropic's guidance: "try Haiku 5.5 first" for high-volume work whose output can be checked |

Species accuracy is the product, and the identifier now also decides whether
a photo is the player's own, so do not switch on price alone. The comparison
puts the 99 labelled library photos and twelve sample cheat pictures
(`eval/cheat-samples/`: screens, screenshots, watermarked and drawn pictures)
through the live prompt on each model. For each model it reports the
right-species rate, time per photo, cost, how many real photos were wrongly
turned down as "not the player's own", and how many of the cheat pictures
were turned down.

**From GitHub (no setup on your computer):** add your Anthropic key as a
repository secret named `ANTHROPIC_API_KEY`, then Actions → "Compare
identifier models" → Run workflow. Run it with the confirm box empty to see
the plan and the cost; type `run` in the box to spend the money (about $5.50
for all four models). The results are on the run's summary page.

**From a computer with the key in `.env`:**

```bash
npm run eval:identify -- --cheats eval/cheat-samples
```

That prints the plan and the cost and sends nothing. Add `--yes` to run it.

The library photos are easier than real phone photos, and the cheat samples
are obvious ones, so treat a good score as "worth a second test on real
player photos" (`--dir` and `--labels` take your own), not as proof.

### Scout's writing and photo checks

These are already small. Switching them saves cents, not dollars; the reason
to consider it is speed (a story nobody has opened yet is written on the spot,
and a faster model shortens that wait). Facts are shown to young players as
true, so read a sample before moving `CLAUDE_MODEL_TEXT` down a tier.

## Considered and left alone

- **Batch pricing (50% off) for the nightly story pre-writing.** It would save
  a few cents a day and needs a second job to collect results.
- **A cheap "is there an animal?" pre-check before the identifier.** With the
  identifier on Opus this could pay; on Haiku it would cost more than it saves.
  Revisit after the model decision.
- **Smaller photos for the identifier (1024px).** About a third cheaper again,
  at some cost to small or distant animals. `npm run eval:identify` can answer
  this too once there are real player photos to test with.
- **A separate AI call, or an outside service, to spot computer-made
  pictures.** Nothing available today does this reliably, and an outside
  service means sending players' photos to another company. See
  [DECISIONS.md](DECISIONS.md), "If cheating shows up anyway".
- **Structured outputs for the identifier.** The current prompt-and-parse
  request works unchanged on every model, which is what makes the model
  switchable by environment variable.

## Measuring it for real

Vercel → Logs, filter on `claude_usage`. Each line has the job, the model that
answered, `inputTokens`, `outputTokens`, `cacheReadTokens`,
`cacheWriteTokens` and `ms`. A day of those lines turns every estimate on this
page into a measurement. `identify_failure` lines show why any identification
failed, including `daily_limit` when a player hits their allowance.
`not_own_photo` lines show each photo the check turned down and why;
`picture_doubt` lines show photos it let through but wasn't sure about.
