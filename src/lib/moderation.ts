import { CREW_RESERVED_NAMES } from '../../shared/crew';

// Lightweight pre-post filter for objectionable language (App Store Guideline
// 1.2 asks UGC apps to filter objectionable material before it's posted). It's
// a first line of defense only — reports + review handle the rest. Extend the
// list as needed; matching is whole-word, case-insensitive, and tolerant of
// simple obfuscation (f.u.c.k, sh1t, repeated letters).

const BLOCKED_TERMS = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard',
  'asshole', 'dick', 'dickhead', 'cock', 'cunt', 'pussy', 'whore', 'slut', 'twat', 'wanker',
  'porn', 'nude', 'nudes', 'rape', 'rapist', 'kys', 'killyourself',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalize(word: string): string {
  return word
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1'); // "fuuuuck" → "fuuck"
}

const BLOCKED = new Set(BLOCKED_TERMS);

function isBlocked(token: string): boolean {
  const n = normalize(token);
  if (!n) return false;
  if (BLOCKED.has(n)) return true;
  // collapse doubled letters as a second pass ("fuuck" → "fuck")
  return BLOCKED.has(n.replace(/(.)\1+/g, '$1'));
}

// Returns a user-facing message if the text should be blocked, else null.
export function checkText(text: string): string | null {
  const tokens = text.split(/\s+/);
  // Also check the whole message with spaces/dots removed, to catch "f u c k".
  const squashed = normalize(text);
  const hit = tokens.some(isBlocked) || BLOCKED_TERMS.some((t) => t.length >= 4 && squashed === t);
  return hit
    ? 'That contains language that isn’t allowed on ClipIt. Please keep it friendly — see our community rules in the Terms of Use.'
    : null;
}

// Names reserved for Scout (the AI companion), the retired crew, and the team
// itself, so players can't pass themselves off as any of them.
export function reservedName(name: string): string | null {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return CREW_RESERVED_NAMES.includes(n) || n.includes('clipit') || n.includes('clip it') || n.includes('field crew')
    ? 'That name is reserved. Please choose a different display name.'
    : null;
}
