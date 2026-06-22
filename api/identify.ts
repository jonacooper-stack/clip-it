import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// Real Claude identification for the web app. Mirrors the structured-output design
// in supabase/functions/_shared/vision.ts, adapted to a Vercel Node function.
// The app POSTs a base64 photo; we return species + behavior tags + a rarity
// estimate, and the app's existing scoring engine turns that into points.
// The ANTHROPIC_API_KEY is a server-only Vercel env var — never exposed to the app.

export const config = { maxDuration: 30 };

const MODEL = 'claude-opus-4-8';

const SCENE_TAG_CODES = ['with_young', 'predation', 'in_flight', 'courtship', 'group_herd'] as const;

const SYSTEM_PROMPT =
  'You are a wildlife identification assistant for a citizen-science photography game. ' +
  'Given a photo, identify the single most prominent wild animal: its scientific name and ' +
  'common name, with a calibrated confidence in [0,1]. Also estimate how rare the animal is on ' +
  'a 0..1 scale (0 = very common like a pigeon or gray squirrel, 1 = very rare). Report notable ' +
  'behavior/scene tags from the allowed set, a one-line caption, whether the animal could be ' +
  'dangerous to a person who approached it, and whether a human should review your answer ' +
  '(needsReview true when confidence is low, the species is a hard-to-distinguish look-alike, or ' +
  'the scene is ambiguous). If there is no wild animal, set animalPresent false and leave the ' +
  'names empty. Never guess a precise species when unsure — lower the confidence instead.';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    animalPresent: { type: 'boolean' },
    scientificName: { type: 'string' },
    commonName: { type: 'string' },
    confidence: { type: 'number' },
    rarityScore: { type: 'number' },
    sceneTags: { type: 'array', items: { type: 'string', enum: SCENE_TAG_CODES } },
    caption: { type: 'string' },
    dangerous: { type: 'boolean' },
    needsReview: { type: 'boolean' },
  },
  required: [
    'animalPresent',
    'scientificName',
    'commonName',
    'confidence',
    'rarityScore',
    'sceneTags',
    'caption',
    'dangerous',
    'needsReview',
  ],
} as const;

const clamp01 = (n: number) => (Number.isNaN(n) ? 0 : Math.min(Math.max(n, 0), 1));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' });

  const body = (req.body ?? {}) as { imageBase64?: string; mediaType?: string };
  let imageBase64 = body.imageBase64;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  // Accept either a data: URL or raw base64.
  const marker = imageBase64.indexOf('base64,');
  if (marker !== -1) imageBase64 = imageBase64.slice(marker + 'base64,'.length);
  const mediaType =
    (body.mediaType as 'image/jpeg' | 'image/png' | 'image/webp') || 'image/jpeg';

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Identify the animal and scene. Respond only as the required JSON.' },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    } as any);

    const textBlock = (response.content as any[]).find((b) => b.type === 'text');
    const parsed = JSON.parse(textBlock && 'text' in textBlock ? textBlock.text : '{}');

    const sceneTags: string[] = Array.isArray(parsed.sceneTags)
      ? parsed.sceneTags.filter((t: string) => (SCENE_TAG_CODES as readonly string[]).includes(t))
      : [];
    const confidence = clamp01(Number(parsed.confidence));
    const needsReview =
      Boolean(parsed.needsReview) ||
      confidence < 0.75 ||
      sceneTags.includes('predation') ||
      Boolean(parsed.dangerous);

    return res.status(200).json({
      animalPresent: Boolean(parsed.animalPresent) && Boolean(parsed.scientificName),
      species: {
        scientificName: parsed.scientificName ?? '',
        commonName: parsed.commonName ?? '',
        confidence,
      },
      rarityScore: clamp01(Number(parsed.rarityScore)),
      sceneTags,
      caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      dangerous: Boolean(parsed.dangerous),
      idStatus: needsReview ? 'needs_review' : 'ai_confident',
      modelVersion: (response as any).model ?? MODEL,
    });
  } catch (err: any) {
    console.error('identify error', err);
    return res.status(502).json({ error: 'identification failed', detail: String(err?.message ?? err) });
  }
}
