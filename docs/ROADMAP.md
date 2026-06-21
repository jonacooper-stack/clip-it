# Clip-It — Roadmap

*The MVP definition and the phased plan after it. See [CONCEPT.md](CONCEPT.md) for what
we're building and [ARCHITECTURE.md](ARCHITECTURE.md) for how.*

---

## The MVP — prove the solo loop is fun

**The whole MVP in one sentence:**

> Go out → open the in-app camera → photograph an animal → AI identifies & scores it in
> seconds → you earn points and it's added to your field journal → a quest or streak
> nudges you back out tomorrow.

Everything that doesn't directly test *"is that loop fun?"* is cut from v1.

| ✅ In the MVP | ⛔ Deferred (and which phase) |
|---|---|
| Sign-in + age gate; **parents can create privacy-protected child profiles** | Social / parties / shared points → **Phase 2** |
| Short "ethos & how scoring works" intro | Public sightings **map** → **Phase 3** (we still *store* location now) |
| **In-app camera capture only** (attaches GPS + timestamp; queues if offline) | **Freemium / payments**, verified-vs-unverified tiers → **Phase 4** |
| AI identification: species + confidence + behavior tags (with-young, predation, in-flight…) | Importing internet / camera-roll photos → **Phase 4** |
| Scoring with a satisfying reveal animation | Science **data export** to researchers → **Phase 5** (schema ready now) |
| **Field journal / collection** (your species, counts, best shots, points) — the core dopamine surface | Geographic / regional rarity → later enhancement (schema-ready now) |
| Lightweight, data-driven **quests + streaks** | Leaderboards, advanced anti-cheat, push beyond a streak reminder |
| **Dispute a sighting + submit your own guess** → routes to human review | Polished moderation console (MVP uses a simple review queue) |
| Dangerous-species warning + "keep your distance" messaging | Geofenced habitat enforcement, zoo/captive detection |

**Screen flow (high level):** Welcome / Sign-in → Age gate (parent sets up a child profile
if under-13) → Ethos + permissions → **Home ("Go Spot")** with today's quest, streak,
recent catches → Camera → "Identifying…" → **Result reveal** (species, confidence, points
breakdown, "add to journal" — or "Not right? Tell us what you think") → Sighting detail →
**Field Journal** → Quests → Profile.

**Success metric:** the MVP is a real bet that the loop is fun *without* social or a map.
The number that matters is **repeat-capture / return rate** — do testers go out again
tomorrow? If they photograph one animal and never come back, we fix the core loop (richer
quests, better reveal feel, more collection payoff) **before** building anything below.

## Phases after the MVP

Ordered by value × dependency, with the riskiest location work gated *before* anything
broadcasts a location.

1. **MVP — the solo spotting loop** (above): is it fun?

2. **Phase 1.5 — Open under-13 to the public.** Add the formal verifiable-parental-consent
   flow + kid-safe hardening so kids beyond our private test can join. Small, focused, and
   legally important; slots in right after the loop is validated.

3. **Phase 2 — Social / parties (the growth engine).** Invite friends, go out together,
   pool points, share beautiful sighting cards (built for off-app virality). Depends only
   on the core loop being fun; highest-leverage thing after the MVP. *(Anti-cheat gets
   hardened here, since now there's a reason to cheat.)*

4. **Phase 3 — Sightings map.** "Where have animals been seen / what's near me." Gated
   **behind the location-privacy model** (precise locations stay private; sensitive /
   endangered species are fuzzed or suppressed). As much policy as engineering.

5. **Phase 4 — Freemium / monetization.** Free vs paid; paid unlocks verified sightings +
   the map + advanced features. Lands after the map exists (a headline paid feature) and
   after we've proven people come back.

6. **Phase 5 — Science data export / partnerships.** Researcher-ready feeds and possible
   pushes to platforms like GBIF / iNaturalist. Last because it needs volume, verification,
   and rock-solid endangered-species handling first — and the day-one schema discipline is
   what makes it cheap when we arrive.

## How we'll verify the MVP works

**Technical acceptance (end-to-end):** on a real phone — sign in → set up a child profile
as a parent → grant permissions → capture an animal photo → confirm the server identifies
it, scoring returns sensible points (spot-check deer = 1, deer + young ≈ 3, a predation
scene ≈ 6), the sighting persists with precise + fuzzed location, and the journal + quest
progress update. Capture with no signal and confirm it uploads when back online. Dispute a
sighting with your own guess and confirm it lands in the review queue and a correction
re-scores cleanly.

**Product validation (the real test):** put it in the hands of a small group (founders,
kids under parent accounts, family across a few locations) for 1–2 weeks and watch
**return / repeat-capture rate**, sightings per session, and where people drop off. That
tells us whether to push into Phase 1.5 / 2 or keep polishing the loop.
