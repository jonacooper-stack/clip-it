import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// Real Claude identification for the web app. The app POSTs a base64 photo; we
// return species + behavior tags + a rarity estimate, and the app's existing
// scoring engine turns that into points. The ANTHROPIC_API_KEY is a server-only
// Vercel env var — never exposed to the app.
//
// We ask for plain JSON in the prompt and parse it tolerantly rather than using
// the structured-output (`output_config`) API: that keeps the request compatible
// across SDK versions and model tiers, which the structured-output path was not.

export const config = { maxDuration: 30 };

const MODEL = 'claude-opus-4-8';

const SCENE_TAG_CODES = ['with_young', 'predation', 'in_flight', 'courtship', 'group_herd'] as const;

const SYSTEM_PROMPT =
  'You are the identifier for a wildlife photography game. Look at the photo and identify the ' +
  'single most prominent subject — whether it is a wild animal, a domestic pet, or a person. ' +
  'ALWAYS identify what you see, so the player knows the camera works, then judge whether it is ' +
  'eligible to score. Only WILD animals earn points. Domestic pets (dogs, cats, rabbits, etc.), ' +
  'humans, and anything that is not a living animal do NOT earn points. Never guess a precise ' +
  'species when unsure — lower the confidence instead.\n\n' +
  'Respond with ONLY a single minified JSON object — no markdown, no code fences, no prose before ' +
  'or after. It must have exactly these keys:\n' +
  '  present (boolean): true if there is any identifiable animal or person; false only if there is ' +
  'no animal or person at all (a wall, scenery, food, an object, an empty frame)\n' +
  '  category (string): one of "wild_animal", "pet", "human", "other"\n' +
  '  commonName (string): what it is, e.g. "White-tailed deer", "Domestic dog", "Person" ("" only if present is false)\n' +
  '  scientificName (string): scientific name for any animal including pets (e.g. "Canis lupus familiaris"); "" for a human or when not applicable\n' +
  '  confidence (number 0..1): how sure you are of the identification\n' +
  '  rarityScore (number 0..1): for wild animals only (0 = very common like a pigeon, 1 = very rare); 0 otherwise\n' +
  `  sceneTags (array of strings, each one of: ${SCENE_TAG_CODES.join(', ')})\n` +
  '  caption (string): one friendly sentence about the subject\n' +
  '  dangerous (boolean): could this animal hurt someone who approached it\n' +
  '  needsReview (boolean): true when confidence is low or it is a hard-to-distinguish look-alike\n' +
  '  ineligibleReason (string): when category is not "wild_animal", a short friendly reason such as ' +
  '"Domestic pets don\'t count — point the camera at a wild animal to score." or "People don\'t ' +
  'count — go find some wildlife!"; "" for a wild animal';

const clamp01 = (n: number) => (Number.isNaN(n) ? 0 : Math.min(Math.max(n, 0), 1));

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// Detect the real image type from the base64 magic bytes. The client's claimed
// mediaType is often wrong (the web camera captures PNG but we labelled it JPEG),
// and Anthropic rejects a media_type that doesn't match the actual bytes.
function detectMediaType(b64: string): ImageMediaType | null {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return null;
}

// Pull the first balanced-looking JSON object out of the model's text, tolerating
// stray prose or ```json fences if the model adds them despite instructions.
function parseModelJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`model did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

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
  // Trust the actual image bytes over the client's claimed type — Anthropic rejects
  // a media_type that doesn't match the bytes (web camera captures are PNG).
  const mediaType: ImageMediaType =
    detectMediaType(imageBase64) ?? ((body.mediaType as ImageMediaType) || 'image/jpeg');

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
            { type: 'text', text: 'Identify the animal and scene. Respond with only the JSON object.' },
          ],
        },
      ],
    });

    const textBlock = (response.content as any[]).find((b) => b.type === 'text' && 'text' in b);
    const parsed = parseModelJson(textBlock?.text ?? '');

    const category = (['wild_animal', 'pet', 'human', 'other'] as const).includes(parsed.category)
      ? (parsed.category as 'wild_animal' | 'pet' | 'human' | 'other')
      : 'other';
    const present = Boolean(parsed.present) && Boolean(parsed.commonName);
    const eligible = present && category === 'wild_animal' && Boolean(parsed.scientificName);

    const sceneTags: string[] = Array.isArray(parsed.sceneTags)
      ? parsed.sceneTags.filter((t: string) => (SCENE_TAG_CODES as readonly string[]).includes(t))
      : [];
    const confidence = clamp01(Number(parsed.confidence));
    const needsReview =
      Boolean(parsed.needsReview) ||
      confidence < 0.75 ||
      sceneTags.includes('predation') ||
      Boolean(parsed.dangerous);

    // Three outcomes: a scoreable wild animal, something identified-but-ineligible
    // (a pet or person), or nothing identifiable at all.
    const idStatus = !present
      ? 'rejected'
      : !eligible
        ? 'ineligible'
        : needsReview
          ? 'needs_review'
          : 'ai_confident';

    return res.status(200).json({
      present,
      eligible,
      category,
      species: {
        scientificName: parsed.scientificName ?? '',
        commonName: parsed.commonName ?? '',
        confidence,
      },
      rarityScore: eligible ? clamp01(Number(parsed.rarityScore)) : 0,
      sceneTags: eligible ? sceneTags : [],
      caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      dangerous: Boolean(parsed.dangerous),
      idStatus,
      ineligibleReason: typeof parsed.ineligibleReason === 'string' ? parsed.ineligibleReason : '',
      modelVersion: (response as any).model ?? MODEL,
    });
  } catch (err: any) {
    // Bubble up the real reason (model error, auth, rate limit, parse failure) so
    // the app can show it instead of a generic message.
    const status = err?.status ? `${err.status} ` : '';
    const detail = `${status}${String(err?.message ?? err)}`.slice(0, 300);
    console.error('identify error', err);
    return res.status(502).json({ error: 'identification failed', detail });
  }
}
