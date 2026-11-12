// Every Claude call the server makes goes through this file: which model does
// which job, how each model wants to be asked, and one usage log line per call.
import Anthropic from '@anthropic-ai/sdk';
import { log } from './server';

// ---------- which model does which job ----------
// Change a job's model without touching code: set the variable in Vercel →
// Settings → Environment Variables and redeploy. Before switching the
// identifier, compare models on real photos with `npm run eval:identify`
// (see docs/AI_COSTS.md).
export type Job = 'identify' | 'facts' | 'forecast' | 'story' | 'photo_check';

export const MODELS = {
  // Names the animal in a player's photo. Runs on every capture: this is where
  // nearly all of the AI bill is.
  identify: process.env.CLAUDE_MODEL_IDENTIFY || 'claude-opus-4-8',
  // Scout's facts, weekly themes and stories. Written once, cached, and shared
  // by everyone.
  text: process.env.CLAUDE_MODEL_TEXT || 'claude-opus-5-5',
  // Looks at Wikimedia photos before Scout may use them. Once per species.
  photoCheck: process.env.CLAUDE_MODEL_PHOTO_CHECK || 'claude-opus-5-5',
};

export function modelFor(job: Job): string {
  return job === 'identify' ? MODELS.identify : job === 'photo_check' ? MODELS.photoCheck : MODELS.text;
}

// ---------- how each model wants to be asked ----------
// `effort` is how hard the model thinks (and so how long it takes and what it
// costs); these jobs are short and factual, so they run at "low" wherever the
// model has the setting. Models without an entry get a plain request.
// `fallback`: if the model declines a request (a safety false positive on,
// say, "predation"), the API re-runs it on another model within the same
// call. Only some models offer that.
interface Traits {
  effort?: boolean;
  fallback?: { beta: string; fallbacks: 'default' | { model: string }[] };
}

const TRAITS: Record<string, Traits> = {
  'claude-opus-5-5': { effort: true, fallback: { beta: 'server-side-fallback-2026-06-01', fallbacks: [{ model: 'claude-opus-4-8' }] } },
  'claude-opus-5': { effort: true, fallback: { beta: 'server-side-fallback-2026-06-01', fallbacks: [{ model: 'claude-opus-4-8' }] } },
  'claude-sonnet-5-5': { effort: true, fallback: { beta: 'server-side-fallback-2026-07-01', fallbacks: 'default' } },
  'claude-haiku-5-5': { effort: true }, // no server-side fallback on this model
  // Runs without thinking unless asked, exactly as before: leave effort unset.
  'claude-opus-4-8': {},
};

export function traitsOf(model: string): Traits {
  return TRAITS[model] ?? {};
}

// ---------- the client ----------
let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ConfigError('ANTHROPIC_API_KEY is not set');
  client ??= new Anthropic({ apiKey });
  return client;
}

export class ConfigError extends Error {}
// The model (and any fallback) declined to answer.
export class ModelRefusal extends Error {
  constructor(readonly category: string | null) {
    super('the model declined this request');
  }
}

export interface AskOptions {
  job: Job;
  system: string;
  prompt: string | Anthropic.Beta.BetaContentBlockParam[];
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  // How long to wait for the model, and how many times the SDK may retry a
  // dropped connection or an overloaded response.
  timeoutMs?: number;
  maxRetries?: number;
  model?: string; // override (used by the model comparison script)
  // Mark the system prompt as cacheable: calls that share it within five
  // minutes (a burst of captures) are billed a fraction for that part. Only
  // takes effect where the prompt is over the model's minimum cacheable size
  // (512 tokens on the 5.x models, 1,024 on Opus 4.8); harmless elsewhere.
  cacheSystem?: boolean;
}

export interface Usage {
  model: string;
  inputTokens: number; // not counting cached tokens
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  ms: number;
}

// One request → the model's text. Used directly by the photo identifier
// (which asks for JSON in its prompt and parses it tolerantly).
export async function askText(opts: AskOptions): Promise<{ text: string; usage: Usage }> {
  return send(opts, undefined);
}

// One request → one JSON object matching `schema` (structured outputs).
// `prompt` is text, or content blocks (e.g. images to check). Low effort by
// default: these are short, factual answers, cached by the caller.
export async function askJSON<T>(opts: AskOptions & { schema: Record<string, unknown> }): Promise<T> {
  const { text } = await send(opts, opts.schema);
  return JSON.parse(text) as T;
}

async function send(opts: AskOptions, schema: Record<string, unknown> | undefined): Promise<{ text: string; usage: Usage }> {
  const model = opts.model ?? modelFor(opts.job);
  const traits = traitsOf(model);
  const outputConfig: Record<string, unknown> = {};
  if (traits.effort) outputConfig.effort = opts.effort ?? 'low';
  if (schema) outputConfig.format = { type: 'json_schema', schema };

  const started = Date.now();
  const res = await getClient().beta.messages.create(
    {
      model,
      max_tokens: opts.maxTokens ?? 16000,
      ...(traits.fallback ? { betas: [traits.fallback.beta], fallbacks: traits.fallback.fallbacks } : {}),
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      system: opts.cacheSystem ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }] : opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming,
    { timeout: opts.timeoutMs ?? 50_000, maxRetries: opts.maxRetries ?? 1 },
  );

  // One line per call: what each job really costs (Vercel → Logs, filter on
  // "claude_usage"). Token counts only; never prompts, photos or answers.
  const usage: Usage = {
    model: res.model ?? model,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    cacheReadTokens: res.usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage?.cache_creation_input_tokens ?? 0,
    ms: Date.now() - started,
  };
  log('claude_usage', { job: opts.job, ...usage, stop: res.stop_reason });

  if (res.stop_reason === 'refusal') throw new ModelRefusal(((res as any).stop_details?.category as string | undefined) ?? null);
  if (res.stop_reason === 'max_tokens') throw new Error('response was cut off');
  // A response can begin with thinking blocks: find the text by type.
  const block = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!block) throw new Error('no text in response');
  return { text: block.text, usage };
}
