# ClipIt — Architecture

*The technical plan: stack, how identification works, the scoring engine, the data model,
cost control, and safety. See [CONCEPT.md](CONCEPT.md) and [ROADMAP.md](ROADMAP.md) for the
product framing.*

---

## Stack

- **App:** Expo + React Native + TypeScript. `expo-camera`, `expo-location`, Expo Router,
  an offline upload queue, EAS for builds + store submission and over-the-air updates.
  Compiles to real native binaries for both app stores; everyone can demo on their phone.
- **Backend / DB / Auth / Storage:** **Supabase** (chosen over Firebase). The deciding
  factor is that this whole product is **geographic** — "what's near me," and eventually a
  map with privacy-driven location fuzzing. Postgres + **PostGIS** handles real spatial
  data and lets us store a **precise** location (owner-only) and a **fuzzed** location
  (public) cleanly. It also gives relational, science-ready data plus built-in Auth and
  image Storage.
- **Trusted server boundary:** the AI call and scoring run in a **Supabase Edge Function**,
  never on the client — so points can't be forged. Flow: photo in → cheap pre-check →
  vision model → scoring → saved sighting + score out.
- **Vision model (MVP):** a single **multimodal AI call (Claude vision)** returning species
  guess + confidence + behavior/scene tags + a caption in one shot — the only option that
  handles *both* "what species" *and* "fox eating a bunny" together. It lives behind a
  **swappable interface** so we can later add a specialist wildlife classifier for sharper
  species accuracy while keeping the AI for behavior tags. *(Confirm exact current Claude
  model IDs / vision pricing against the live API reference before wiring it up.)*

## Identification, disputes & cost control

- **Everyday loop = AI-first.** On capture, the AI returns species + confidence + behavior
  tags and the score appears instantly. Frictionless — a 9-year-old just points and shoots.
- **Disagree? Dispute it.** From the result/sighting screen you can hit "Not right?" and
  **submit your own guess.** That marks the sighting disputed and sends it (with the
  player's proposed species) to the **human review queue**. A reviewer confirms or corrects,
  and we cleanly re-score. Every correction becomes labeled training data — the review queue
  *is* the data flywheel, and it's how the hybrid "humans adjudicate" model shows up in
  practice.
- **Cost control.** A cheap, fast first pass ("is there even an animal in frame?") runs
  before we pay for the expensive multimodal call, so blurry/empty shots cost nothing. Then
  **confidence routing**: clear common species auto-resolve; only low-confidence, rare,
  dangerous, or high-drama sightings get expensive treatment or human eyes. This protects
  data quality *and* caps the per-sighting bill. As volume grows, the common case moves to a
  cheaper self-hosted classifier.

## Scoring engine

We never hand-assign point values. Instead:

```
base points   = derived from a species RARITY SCORE   (common → low, rare → high)
× behavior multiplier   = product of matched scene tags (with-young, predation, in-flight…)
+ bonuses     = first-time-species + active-quest + streak
= total points   (with caps so it can't explode)
```

The rarity score is computed **once, offline**, from public datasets (observation-frequency
+ conservation status). The canonical examples fall right out:

| Sighting | Calculation | Points |
|---|---|---|
| Common deer | low rarity base | **1** |
| Deer + fawns | base × `with-young` (~×3) | **3** |
| Fox eating a rabbit | modest base × `predation` | **~6** |

`predation` (and similar high-drama tags) auto-flag for a quick human glance, so dramatic
high-value claims stay honest.

Two things this design gives us for free:

- **Geographic rarity later:** because rarity is just data, "rarity" can become
  *rarity-for-where-you-are* by swapping a national number for a regional one — no rebuild,
  same formula.
- **Optional featured species:** a "species of the week" bonus or a hand-boosted flagship
  animal is a tunable override on top — never required, never exhaustive.

Points live on an **append-only ledger**, so we can be *instant and generous* (great for
fun) while staying *correctable* (a dispute cleanly revokes and re-awards).

## Data model (science-ready from day one)

Postgres + PostGIS. Lean for MVP, but with forward-compatible fields that are nearly free
now and brutal to retrofit later:

- **`users`** (+ **parent/guardian ↔ child-profile** links and per-account privacy flags →
  kid-safe accounts and consent tracking are first-class).
- **`species`** — canonical taxonomy, `rarity_score` (+ a **region-aware rarity hook**),
  conservation status, **`sensitivity_level`** (none / sensitive / endangered → drives
  location fuzzing & map suppression), `is_dangerous` + notes, and **external taxonomy IDs**
  (iNat / GBIF) for science interop. Seeded from public datasets, not hand-authored.
- **`sightings`** — `observed_at`, **precise `geom` (owner-only)** *and* **fuzzed
  `geom_public`**, media reference, AI result (candidates + confidence + scene tags + model
  version), `id_status`, **player-proposed species on dispute**, and a
  **`verification_status`** field that powers the future free-vs-paid split with no migration.
- **`scoring_events`** — an **append-only ledger** (base, rarity component, behavior
  multiplier, bonuses, total, `rule_version`, status) so disputes re-score cleanly and
  history is auditable.
- **`scene_tags`** — controlled behavior vocabulary with multipliers (keeps scoring
  data-driven and tunable without code changes).
- **`quests`** / **`user_quests`** — data-driven challenges + progress.
- **`review_queue`** — human adjudication; decisions feed corrections back and become
  training data.
- *Stubbed for later (don't build yet):* parties, follows, subscriptions/entitlements,
  science exports.

## Safety, kids & ethics

These shape the UX from day one; they're product features, not afterthoughts.

- **Kids under 13 — parent in the loop.** Kids play under a **parent-created,
  privacy-protected child profile**: precise location is used only for the child's own
  gameplay/scoring and **never shared with anyone**, data is minimized and retained briefly,
  and there's no open social exposure. For the private test, kids play under a consenting
  parent's account immediately. Before opening under-13 to the **public**, we add a
  recognized **verifiable parental consent** method (the COPPA requirement) as a fast-follow.
  *(Confirm public-launch specifics with counsel — "close enough" isn't good enough here.)*
- **Reward the photo, never the proximity.** Points are for *observation/photo quality*,
  explicitly **not** how close you got. No quest ever implies "get closer." Dangerous
  species trigger a "keep your distance, use zoom" interstitial.
- **Endangered-species location privacy.** A public map revealing the precise location of a
  rare, poachable animal is an active conservation *harm* (a known problem for
  citizen-science apps). Handled structurally: precise locations stay owner-only;
  sensitive/endangered species are **fuzzed or suppressed** on anything public. This is why
  the map is gated to Phase 3 — it can't ship until that model is built.
- **"Observe, don't disturb" ethos** (no baiting, no flushing nests, no trespassing) woven
  into onboarding and the capture screen, plus a real account-deletion / data path.

## Top risks

- **Endangered-species locations leaking** (handled structurally; gates the map).
- **Luring people toward danger** (reward-the-photo-not-proximity + warnings).
- **Kids' data / precise location** — minors + GPS is sensitive; mitigated by parent
  consent, never sharing a child's location, data minimization, and counsel sign-off before
  public launch.
- **AI confidently misidentifying** look-alikes (confidence routing + dispute/human review;
  never present an unreviewed rare ID as "confirmed").
- **Cost per sighting** — AI calls + storage aren't free and players shoot many frames.
  Mitigated by the cheap pre-check, storing one downscaled image (not originals), and
  routing only ambiguous cases to expensive review. Estimate sightings-per-user-per-day
  early — it drives unit economics.
- **The core bet** — is the loop fun without social/map? We find out fast and cheaply.

## First files to build

- `supabase/migrations/0001_init.sql` — Postgres + PostGIS schema (users + parent/child
  links, species w/ rarity + region hook + sensitivity, sightings w/ precise + public
  geometry + player-proposed species on dispute, append-only scoring ledger, scene-tag
  vocabulary, quests, review queue).
- `supabase/functions/identify-and-score/index.ts` — the trusted server function: photo in
  → cheap pre-check → vision model → scoring → saved sighting + score out; handles the
  dispute re-score path.
- `app/(capture)/camera.tsx` — the in-app camera (GPS + timestamp + offline queue): the
  heart of the loop.
- `supabase/functions/_shared/scoring.ts` — rarity → base points × scene multipliers +
  bonuses, with caps, rule versioning, and a region-aware rarity hook. Lives server-side
  (Deno) so points are computed in the trusted boundary, not on the client.
- `supabase/functions/_shared/vision.ts` — the swappable vision interface (Claude-vision
  implementation for the MVP), also server-side.
