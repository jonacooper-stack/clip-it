// Clip-It — vision provider (server-side).
//
// The everyday loop is AI-first: one multimodal call returns a species guess +
// confidence + behavior/scene tags + a caption, which the scoring engine consumes.
// The provider sits behind a swappable interface so we can later add a specialist
// wildlife classifier for species ID while keeping an LLM for behavior tags.
//
// MVP implementation: a single structured Claude vision call.

import Anthropic from "npm:@anthropic-ai/sdk";

// Controlled scene-tag vocabulary — must stay in sync with the `scene_tags` table
// (supabase/migrations/0001_init.sql). The model may only emit these codes; anything
// else is ignored so the LLM can't inject arbitrary scoring multipliers.
export const SCENE_TAG_CODES = [
  "with_young",
  "predation",
  "in_flight",
  "courtship",
  "group_herd",
] as const;

export interface SpeciesCandidate {
  scientificName: string; // "" if unknown
  commonName: string; // "" if unknown
  confidence: number; // 0..1
}

export interface VisionResult {
  animalPresent: boolean;
  candidates: SpeciesCandidate[]; // best first
  sceneTags: string[]; // subset of SCENE_TAG_CODES
  caption: string;
  dangerous: boolean; // could this animal be dangerous to an approaching human?
  needsReview: boolean; // model is unsure / rare / ambiguous
  modelVersion: string; // provenance for reproducibility + science
}

export interface VisionInput {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export interface VisionProvider {
  identify(input: VisionInput): Promise<VisionResult>;
}

// Default model. claude-opus-4-8 is the most capable; for the high-volume cost path
// (see docs/ARCHITECTURE.md → cost control) evaluate claude-sonnet-4-6 or
// claude-haiku-4-5, and/or a cheap "is there an animal?" pre-gate before this call.
const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT =
  "You are a wildlife identification assistant for a citizen-science photography game. " +
  "Given a photo, identify the single most prominent wild animal: its scientific name and " +
  "common name, with a calibrated confidence in [0,1]. Also report notable behavior/scene " +
  "tags from the allowed set, a one-line caption, whether the animal could be dangerous to a " +
  "person who approached it, and whether a human should review your answer (set needsReview " +
  "true when confidence is low, the species is a hard-to-distinguish look-alike, or the scene " +
  "is ambiguous). If there is no wild animal, set animalPresent false and return an empty " +
  "candidates list. Never guess a precise species when unsure — lower the confidence instead.";

// Strict JSON schema for structured output (output_config.format). Note the constraints
// structured outputs support: enums and additionalProperties:false are fine; numeric/length
// bounds are not, so confidence is an unbounded number we clamp downstream.
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    animalPresent: { type: "boolean" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          scientificName: { type: "string" }, // "" if unknown
          commonName: { type: "string" }, // "" if unknown
          confidence: { type: "number" },
        },
        required: ["scientificName", "commonName", "confidence"],
      },
    },
    sceneTags: {
      type: "array",
      items: { type: "string", enum: SCENE_TAG_CODES },
    },
    caption: { type: "string" },
    dangerous: { type: "boolean" },
    needsReview: { type: "boolean" },
  },
  required: [
    "animalPresent",
    "candidates",
    "sceneTags",
    "caption",
    "dangerous",
    "needsReview",
  ],
} as const;

export class ClaudeVisionProvider implements VisionProvider {
  private client: Anthropic;

  constructor(apiKey: string | undefined = Deno.env.get("ANTHROPIC_API_KEY")) {
    this.client = new Anthropic({ apiKey });
  }

  async identify(input: VisionInput): Promise<VisionResult> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType,
                data: input.imageBase64,
              },
            },
            {
              type: "text",
              text: "Identify the animal and scene. Respond only as the required JSON.",
            },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const parsed = JSON.parse(raw);

    return {
      animalPresent: Boolean(parsed.animalPresent),
      candidates: Array.isArray(parsed.candidates)
        ? parsed.candidates.map((c: SpeciesCandidate) => ({
            scientificName: c.scientificName ?? "",
            commonName: c.commonName ?? "",
            confidence: clamp01(Number(c.confidence)),
          }))
        : [],
      // Defensive: keep only tags from the controlled vocabulary.
      sceneTags: Array.isArray(parsed.sceneTags)
        ? parsed.sceneTags.filter((t: string) =>
            (SCENE_TAG_CODES as readonly string[]).includes(t),
          )
        : [],
      caption: typeof parsed.caption === "string" ? parsed.caption : "",
      dangerous: Boolean(parsed.dangerous),
      needsReview: Boolean(parsed.needsReview),
      modelVersion: response.model ?? MODEL,
    };
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}
