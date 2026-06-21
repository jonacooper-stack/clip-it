# Clip-It — Concept

*What the app is, who it's for, and the decisions that anchor it. See also
[ROADMAP.md](ROADMAP.md) for sequencing and [ARCHITECTURE.md](ARCHITECTURE.md) for how
it's built.*

---

## Why we're building this

The idea was sparked by a simple question: catch-and-release fishing exists, so why isn't
there **catch-and-release hunting**? The answer is a **Pokémon-Go-style game for real
wildlife**. Instead of spotting Pokémon, you go outside and spot, stalk, and photograph
**real animals in real habitats**, and you earn points for it — more points for rarer
animals and more dramatic scenes. It borrows the patience and craft of hunting (learning
an animal's habits, finding its den, waiting for the moment) but the "trophy" is a photo
and a score, and the byproduct is knowledge that **helps** wildlife instead of killing it.

Two things have to be true at once:

- **It has to be genuinely fun and gamified** — quests, milestones, collections, streaks,
  and (later) playing with friends — or nobody plays.
- **It has to be good for nature** — turning players into citizen scientists whose
  geolocated sightings can advance real research and conservation, while never encouraging
  people to harm animals, disturb habitats, or put themselves in danger.

## What the app is

> **Clip-It is a mobile game where you photograph wild animals to earn points, complete
> quests, and build a personal field journal — and your sightings quietly become
> citizen-science data that helps protect the animals you're chasing.**

The pieces:

- **Spot & score.** Photograph an animal → the app identifies the species and awards
  points. Points scale with **rarity and drama**: a common deer is worth a little; a deer
  with fawns is worth more; a fox eating a rabbit is worth more still.
- **Quests & milestones.** Rotating challenges, collections to complete, streaks to
  maintain — the gamified spine that keeps people going out.
- **Real photos only.** You photograph it yourself, in-app; sightings are geolocated and
  timestamped — the foundation for both fair play and good science.
- **Play together.** Join a **party** with friends, go out together, and pool/share
  points — fun *and* a built-in viral growth loop. *(Later phase.)*
- **A sightings map.** See where species have been spotted so you know where to look — a
  premium discovery feature, built carefully (see "location privacy" below). *(Later phase.)*
- **Freemium.** A free tier and a paid tier; paid unlocks verified, geolocated sightings,
  the map, and advanced features. *(Later phase.)*
- **For science.** The more we learn about where animals live, feed, and sleep — den
  sites, habitats, behaviors — the better. Players act as citizen scientists; the data is
  structured to be genuinely useful to researchers.
- **Safe and responsible.** Strong safety guardrails (don't approach a grizzly's den),
  age-appropriate access, and an "observe, don't disturb" ethos baked into the experience.
  The game must never reward harming animals, disturbing habitats, or taking risks.

## Who it's for

Adults, teenagers, and **kids — including under-13, with a parent involved**. Kids play
under a parent-managed, privacy-protected profile (see [ARCHITECTURE.md](ARCHITECTURE.md#safety-kids--ethics)).

## Anchoring decisions

| Topic | Decision |
|---|---|
| **How animals get identified** | **AI identifies & scores instantly.** If you disagree, you **dispute it and submit your own guess**, which routes to human review. Keeps the everyday loop fast; the dispute path is where self-ID and the human check live. |
| **Platform** | **Expo / React Native** — one codebase, real native apps for the Apple App Store and Google Play. |
| **What the MVP proves first** | The **solo spotting loop is fun.** Everything else is sequenced after that. |
| **Species breadth** | **Broad / national**, with points derived **automatically** from a rarity score — no hand-picking values. Geographic (regional) rarity is a planned enhancement. |
| **Kids under 13** | **Parent-managed child accounts now**; formal verifiable parental consent added as a fast-follow before public under-13 launch. |
| **Sightings map** | Ships **after** social and **behind** a location-privacy model — a careless map can hurt the animals it celebrates. |
| **Internet / camera-roll uploads** | **Deferred.** MVP is in-app capture only (the simplest anti-cheat). |
| **Vision model** | Start with one multimodal AI call (species + behavior together); upgrade to a specialist wildlife model for species accuracy later. |

## Guiding principles

1. **The MVP's only job is to answer one question: "Is the solo spotting loop fun?"**
   Anything that doesn't test that is cut from v1.
2. **Let the AI carry breadth; let algorithms carry scale.** No hand-curating thousands of
   species or point values — a rarity score drives base points, the AI drives ID + scene tags.
3. **Clean, science-ready data from day one,** even though the science features ship last.
   Cheap now, brutal to retrofit later.
4. **Safety and the "observe, don't disturb" ethos are product features, not legal
   afterthoughts** — and points reward the *photo*, never the *proximity*.
5. **Endangered-species location privacy is a first-class constraint,** not a late add-on —
   the data model and the eventual map both depend on getting it right early.

## Open questions still to settle

- Who maintains the "sensitive species" list, and how do we handle species that are
  globally common but locally sensitive?
- Long-term photo/data licensing for the science feed (e.g. a Creative-Commons-style opt-in).
- When geographic/regional rarity graduates from "planned" to "shipped."
