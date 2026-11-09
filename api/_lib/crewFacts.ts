// Scout's facts: generated once per species, cached in crew_facts, reused for
// everyone (and for Scout's comments on the wall). Written so a 12-year-old can
// read them at a glance: one short sentence each, starting with an emoji.
import type { SupabaseClient } from '@supabase/supabase-js';
import { askJSON } from './claude';
import { log } from './server';
import { withArticle } from '../../shared/crew';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface SpeciesFacts {
  facts: string[];
  tip: string;
}

const SYSTEM =
  'You are Scout, a friendly fox who is the AI guide in ClipIt, a wildlife photography game for ages 13 and up. ' +
  'Players have just photographed an animal. Give them facts a 12-year-old would love and understand at a glance. ' +
  'Rules: only facts that are accurate and widely documented in field guides and encyclopedias; prefer surprising ' +
  'but well-established facts; never invent; avoid exact numbers unless they are textbook-standard. ' +
  'Each fact is ONE short, simple sentence of at most 90 characters, using everyday words, that starts with one ' +
  'fitting emoji and a space. No markdown, no lists inside a fact, no "Did you know". ' +
  'The tip says how to spot this animal or tell it from a look-alike, in the same style (emoji first, at most 90 characters).';

const SCHEMA = {
  type: 'object',
  properties: {
    facts: { type: 'array', items: { type: 'string' } },
    tip: { type: 'string' },
  },
  required: ['facts', 'tip'],
  additionalProperties: false,
};

// In-memory cache per warm instance (in addition to the database cache), so a
// burst of players finding the same species makes one model call.
const memo = new Map<string, Promise<SpeciesFacts>>();

// 'kid:' versions the cache: entries written before the short, emoji-first
// style are ignored and regenerated.
export function speciesKey(common: string, sci?: string | null): string {
  return `kid:${(sci?.trim() || common.trim()).toLowerCase()}`;
}

// Keep facts short even if the model runs long: cut at a word boundary.
export function shorten(text: string, max = 110): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[,;:\s]+$/, '')}…`;
}

export async function getFacts(db: SupabaseClient | null, common: string, sci?: string | null): Promise<SpeciesFacts> {
  const key = speciesKey(common, sci);
  if (!memo.has(key)) {
    memo.set(
      key,
      (async () => {
        if (db) {
          const { data } = await db.from('crew_facts').select('facts').eq('species_key', key).maybeSingle();
          if (data?.facts) return data.facts as SpeciesFacts;
        }
        const out = await askJSON<SpeciesFacts>({
          system: SYSTEM,
          prompt: `Species: ${common}${sci ? ` (${sci})` : ''}. Give 3 facts and 1 tip.`,
          schema: SCHEMA,
        });
        const clean: SpeciesFacts = {
          facts: (out.facts ?? []).map((f) => shorten(String(f))).filter(Boolean).slice(0, 3),
          tip: shorten(String(out.tip ?? '')),
        };
        if (!clean.facts.length) throw new Error('no facts returned');
        if (db) {
          const { error } = await db.from('crew_facts').upsert({ species_key: key, common_name: common, facts: clean });
          if (error) log('crew_facts_cache_error', { detail: error.message });
        }
        log('crew_facts_generated', { species: key });
        return clean;
      })().catch((err) => {
        memo.delete(key); // don't cache failures
        throw err;
      }),
    );
  }
  return memo.get(key)!;
}

// Scout's voice for wall comments. Picks a phrasing from the post id so it's
// stable but varied.
export function scoutComment(species: string, facts: SpeciesFacts, seed: string): string {
  const n = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const fact = facts.facts[n % facts.facts.length];
  const openers = [
    `Wow, ${withArticle(species)}! 🦊`,
    `Great ${species} spot! 🦊`,
    `${cap(withArticle(species))}! Nice one 🦊`,
    `Ooh, ${species}! 🦊`,
  ];
  return `${openers[n % openers.length]}\n${fact}`;
}

export function scoutWelcome(name: string, species: string | null): string {
  const first = name.split(' ')[0] || 'explorer';
  return species
    ? `Welcome to the wall, ${first}! 🦊\n🎉 ${cap(withArticle(species))} for your first post. What a start!`
    : `Welcome to the wall, ${first}! 🦊\n🎉 What a first post. See you out there!`;
}
