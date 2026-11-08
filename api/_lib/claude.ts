// Claude calls for the Field Crew (Dr. Hoot's facts, Scout's forecasts).
import Anthropic from '@anthropic-ai/sdk';

export const CREW_MODEL = 'claude-opus-5-5';
// If the main model declines (a safety false positive on, say, "predation"),
// the API re-runs the same request on this model within the same call.
const FALLBACK_MODEL = 'claude-opus-4-8';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic({ apiKey });
  return client;
}

// One request → one JSON object matching `schema` (structured outputs).
// Low effort: these are short, factual answers, cached by the caller.
export async function askJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const res = await getClient().beta.messages.create({
    model: CREW_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-06-01'],
    fallbacks: [{ model: FALLBACK_MODEL }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: opts.schema } },
    system: opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
  });
  if (res.stop_reason === 'refusal') throw new Error('the model declined this request');
  if (res.stop_reason === 'max_tokens') throw new Error('response was cut off');
  const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!text) throw new Error('no text in response');
  return JSON.parse(text.text) as T;
}
