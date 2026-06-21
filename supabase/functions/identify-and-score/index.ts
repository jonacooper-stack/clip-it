// Clip-It — identify-and-score Edge Function (the trusted server boundary).
//
// Flow:
//   image (in Storage) -> [cheap pre-check] -> Claude vision -> species lookup
//   -> scoring engine -> persist sighting + append-only scoring_event
//   -> route low-confidence / rare / dangerous / high-drama to human review.
//
// Scoring and the AI key live here, never on the client, so points can't be forged.
// This is the MVP skeleton: the shape is complete; a few data-access spots are marked
// TODO where they depend on final Storage/table conventions.

import { createClient } from "npm:@supabase/supabase-js";
import { ClaudeVisionProvider, type VisionProvider } from "../_shared/vision.ts";
import { scoreSighting, type SceneTag } from "../_shared/scoring.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service-role client bypasses RLS — only ever used here on the server.
const db = createClient(supabaseUrl, serviceRoleKey);
const vision: VisionProvider = new ClaudeVisionProvider();

// Confidence below which we don't auto-resolve, even for a common species.
const AUTO_RESOLVE_CONFIDENCE = 0.75;

Deno.serve(async (req) => {
  try {
    const { sightingId } = await req.json();
    if (!sightingId) {
      return json({ error: "sightingId is required" }, 400);
    }

    // 1. Load the sighting.
    const { data: sighting, error: loadErr } = await db
      .from("sightings")
      .select("id, user_id, media_path")
      .eq("id", sightingId)
      .single();
    if (loadErr || !sighting) return json({ error: "sighting not found" }, 404);

    // 2. Fetch the image bytes from Storage and base64-encode them.
    // TODO: confirm bucket name / path convention.
    const { data: blob, error: dlErr } = await db.storage
      .from("sightings")
      .download(sighting.media_path);
    if (dlErr || !blob) return json({ error: "image download failed" }, 500);
    const imageBase64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    // 3. (Cheap pre-check would go here — skip the expensive call on empty/blurry
    //     frames once we add a lightweight gate. MVP relies on the model's
    //     animalPresent flag below.)

    // 4. AI identification.
    const result = await vision.identify({ imageBase64, mediaType: "image/jpeg" });

    if (!result.animalPresent) {
      await db
        .from("sightings")
        .update({ id_status: "rejected", ai_result: result, ai_model_version: result.modelVersion })
        .eq("id", sightingId);
      return json({ status: "rejected", reason: "no_animal" });
    }

    // 5. Match the top candidate to the species catalog.
    const top = result.candidates[0];
    const { data: species } = await db
      .from("species")
      .select("id, rarity_score, sensitivity_level, is_dangerous")
      .eq("scientific_name", top?.scientificName ?? "")
      .maybeSingle();

    // Unknown species → pending + needs review (don't fabricate a score).
    const speciesUnknown = !species;

    // 6. Resolve scene-tag multipliers from the controlled vocabulary.
    const { data: tagRows } = await db
      .from("scene_tags")
      .select("code, multiplier, requires_review")
      .in("code", result.sceneTags.length ? result.sceneTags : [""]);
    const sceneTags: SceneTag[] = (tagRows ?? []).map((t) => ({
      code: t.code,
      multiplier: Number(t.multiplier),
      requiresReview: t.requires_review,
    }));

    // 7. First-of-species bonus?
    let firstOfSpecies = false;
    if (species) {
      const { count } = await db
        .from("sightings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sighting.user_id)
        .eq("species_id", species.id)
        .eq("id_status", "human_confirmed");
      firstOfSpecies = (count ?? 0) === 0;
    }

    // 8. Decide routing. Anything uncertain, rare, dangerous, or high-drama gets a
    //    human glance and a *provisional* score so the player still gets the hit.
    const confidence = top?.confidence ?? 0;
    const sensitive = species?.sensitivity_level && species.sensitivity_level !== "none";
    const dangerous = result.dangerous || species?.is_dangerous;
    const highDrama = sceneTags.some((t) => t.requiresReview);
    const needsReview =
      speciesUnknown ||
      result.needsReview ||
      confidence < AUTO_RESOLVE_CONFIDENCE ||
      Boolean(sensitive) ||
      Boolean(dangerous) ||
      highDrama;

    // 9. Score (skip if species unknown — score on confirmation instead).
    const score = species
      ? scoreSighting({ rarityScore: Number(species.rarity_score), sceneTags, firstOfSpecies })
      : null;

    const idStatus = speciesUnknown
      ? "needs_review"
      : needsReview
      ? "needs_review"
      : "ai_confident";

    // 10. Persist the sighting. geom_public (fuzzed) is computed in SQL/trigger or a
    //     helper; suppressed entirely for sensitive species. TODO: wire fuzzing helper.
    await db
      .from("sightings")
      .update({
        species_id: species?.id ?? null,
        id_status: idStatus,
        ai_result: result,
        ai_model_version: result.modelVersion,
      })
      .eq("id", sightingId);

    // 11. Append the scoring event (provisional while review is pending).
    if (score) {
      await db.from("scoring_events").insert({
        sighting_id: sightingId,
        user_id: sighting.user_id,
        base_points: score.basePoints,
        rarity_component: score.rarityComponent,
        behavior_multiplier: score.behaviorMultiplier,
        bonuses: score.bonuses,
        total_points: score.totalPoints,
        rule_version: score.ruleVersion,
        status: needsReview ? "provisional" : "final",
      });
    }

    // 12. Enqueue for human review when needed.
    if (needsReview) {
      await db.from("review_queue").insert({
        sighting_id: sightingId,
        reason: speciesUnknown
          ? "low_confidence"
          : dangerous
          ? "dangerous"
          : sensitive
          ? "rare"
          : highDrama
          ? "high_drama"
          : "low_confidence",
        priority: dangerous || sensitive ? 10 : 0,
      });
    }

    return json({
      status: idStatus,
      species: top,
      sceneTags: result.sceneTags,
      caption: result.caption,
      points: score?.totalPoints ?? null,
      provisional: needsReview,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
