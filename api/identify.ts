import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient, dailyLimitReached, rateLimited, verifyUser } from './_lib/server';
import { askText, ConfigError, ModelRefusal } from './_lib/claude';
import {
  detectMediaType, IDENTIFY_SYSTEM, IDENTIFY_USER, MAX_IMAGE_BASE64, normalizeIdentification, parseModelJson, stripDataUrl,
} from './_lib/identifyCore';

// Real Claude identification. The app POSTs a base64 photo; we return species +
// behavior tags + a rarity estimate, and the app's scoring engine turns that
// into points. The ANTHROPIC_API_KEY is a server-only Vercel env var — never
// exposed to the app. The prompt and the rules for reading the model's answer
// live in _lib/identifyCore.ts; the model is chosen in _lib/claude.ts.
//
// Only signed-in ClipIt players may call this endpoint (it spends Anthropic
// credit per request), within a per-minute burst limit and a daily allowance.
//
// Status codes the app relies on:
//   200  identified (or "nothing to identify")
//   400 / 413 / 422  this photo can never be identified (don't retry it)
//   401  sign in again     429  slow down / daily allowance used up
//   502 / 504  try again later

export const config = { maxDuration: 30 };

// One JSON line per failure, so problems show up in Vercel → Logs (filter on
// "identify_failure") instead of on the player's screen. Never logs tokens or
// image data.
function logFailure(reason: string, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ event: 'identify_failure', reason, ...extra }));
}

const RATE_MAX = 20; // identifications per user per minute (per warm instance)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const userId = await verifyUser(req.headers.authorization, logFailure);
  if (!userId) return res.status(401).json({ error: 'sign in required', detail: 'Please sign in to identify sightings.' });
  if (rateLimited(`identify:${userId}`, RATE_MAX)) {
    logFailure('rate_limited', { userId });
    return res.status(429).json({ error: 'too many requests', detail: 'Slow down a little — try again in a minute.' });
  }

  const body = (req.body ?? {}) as { imageBase64?: unknown };
  if (typeof body.imageBase64 !== 'string' || !body.imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  const imageBase64 = stripDataUrl(body.imageBase64);
  if (imageBase64.length > MAX_IMAGE_BASE64) {
    logFailure('image_too_large', { userId, size: imageBase64.length });
    return res.status(413).json({ error: 'image too large', detail: 'That photo is too large to identify.' });
  }
  // Trust the actual image bytes over the client's claimed type — Anthropic rejects
  // a media_type that doesn't match the bytes (web camera captures are PNG).
  const mediaType = detectMediaType(imageBase64);
  if (!mediaType) {
    logFailure('unsupported_image', { userId });
    return res.status(400).json({ error: 'unsupported image', detail: 'That photo isn’t in a format we can read.' });
  }

  if (await dailyLimitReached(adminClient(), userId, 'identify')) {
    logFailure('daily_limit', { userId });
    return res.status(429).json({ error: 'daily limit reached', detail: 'You’ve reached today’s limit for identifying photos. It resets tomorrow.' });
  }

  try {
    const { text, usage } = await askText({
      job: 'identify',
      system: IDENTIFY_SYSTEM,
      cacheSystem: true, // the same instructions on every capture
      prompt: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: IDENTIFY_USER },
      ],
      // Room for the short JSON answer plus, on models that think first, the thinking.
      maxTokens: 4096,
      // The app gives up after 28s and queues the capture; a retry here would
      // only spend credit on an answer nobody is waiting for.
      timeoutMs: 24_000,
      maxRetries: 0,
    });
    return res.status(200).json({ ...normalizeIdentification(parseModelJson(text)), modelVersion: usage.model });
  } catch (err: any) {
    // The reason goes to the logs, not to the app: raw provider errors can
    // carry details that shouldn't leave the server.
    if (err instanceof ConfigError) {
      logFailure('missing_api_key');
      return res.status(500).json({ error: 'identification is not configured' });
    }
    if (err instanceof ModelRefusal) {
      logFailure('model_declined', { userId, category: err.category });
      return res.status(422).json({ error: 'could not identify', detail: 'We couldn’t identify that photo.' });
    }
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    logFailure('model_error', { userId, status, detail: String(err?.message ?? err).slice(0, 300) });
    if (status === 400 || status === 413) return res.status(422).json({ error: 'could not identify', detail: 'We couldn’t read that photo.' });
    const timedOut = err instanceof Anthropic.APIConnectionTimeoutError;
    return res.status(timedOut ? 504 : 502).json({ error: 'identification failed', detail: 'The identifier is busy. Please try again in a moment.' });
  }
}
