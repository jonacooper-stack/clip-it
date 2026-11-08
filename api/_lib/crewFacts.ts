// Dr. Hoot's facts: generated once per species, cached in crew_facts, reused
// for everyone (and for Dr. Hoot's comments on the wall).
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
  'You write field notes for ClipIt, a wildlife photography game. Players have just photographed an animal ' +
  'and want to learn something delightful about it. Write facts that are accurate and widely documented in field ' +
  'guides and encyclopedias: prefer surprising but well-established facts over trivia you are unsure of, avoid ' +
  'precise figures unless they are textbook-standard, and never invent. Each fact is one plain sentence under 170 ' +
  'characters, no emoji, no markdown. The tip helps a player tell this species from a common look-alike, or says ' +
  'where and when to look for it; it also stays under 170 characters.';

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

export function speciesKey(common: string, sci?: string | null): string {
  return (sci?.trim() || common.trim()).toLowerCase();
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
          facts: (out.facts ?? []).map((f) => String(f).trim()).filter(Boolean).slice(0, 3),
          tip: String(out.tip ?? '').trim(),
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

// Dr. Hoot's voice for wall comments. Picks a phrasing from the post id so
// it's stable but varied.
export function hootComment(species: string, facts: SpeciesFacts, seed: string): string {
  const n = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const fact = facts.facts[n % facts.facts.length];
  const openers = [
    `Hoo! ${cap(withArticle(species))}! Field note: `,
    `Ooh, ${species}! Did you know? `,
    `Excellent ${species} spot. Fun fact: `,
    `Hoo-hoo, ${withArticle(species)}! `,
  ];
  return `🦉 ${openers[n % openers.length]}${fact}`;
}
