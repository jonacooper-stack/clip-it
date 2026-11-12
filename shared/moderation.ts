// The objectionable-language filter, shared by the app (checked before a
// comment, caption or display name is posted) and the server (checked before
// Scout repeats anything a player typed). Keep this file free of React Native
// and Node-only imports.
//
// A first line of defense only — reports and review handle the rest. Extend
// the list as needed; matching is whole-word, case-insensitive, and tolerant
// of simple obfuscation (f.u.c.k, sh1t, repeated letters).

export const BLOCKED_TERMS = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard',
  'asshole', 'dick', 'dickhead', 'cock', 'cunt', 'pussy', 'whore', 'slut', 'twat', 'wanker',
  'porn', 'nude', 'nudes', 'rape', 'rapist', 'kys', 'killyourself',
];

export const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

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

// True if the text contains language that isn't allowed on ClipIt.
export function hasBlockedLanguage(text: string): boolean {
  const tokens = text.split(/\s+/);
  // Also check the whole message with spaces/dots removed, to catch "f u c k".
  const squashed = normalize(text);
  return tokens.some(isBlocked) || BLOCKED_TERMS.some((t) => t.length >= 4 && squashed === t);
}

// A plausible animal name, as typed by an app we don't control: letters (any
// alphabet), spaces, hyphens, apostrophes, periods, the hybrid sign, and one
// optional bracketed part — "Black-crowned night heron", "Canis lupus
// familiaris", "Eurasian lynx (kitten)". No digits, links or symbols, at most
// seven words, nothing from the blocked list. Returns the tidied name, or null.
const NAME = /^\p{L}[\p{L}\p{M}'’.×\- ]*(?: \([\p{L}\p{M}'’.\- ]+\))?$/u;

export function cleanName(value: unknown, maxLength = 60): string | null {
  if (typeof value !== 'string') return null;
  const s = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > maxLength || !NAME.test(s)) return null;
  if (s.split(' ').length > 7 || hasBlockedLanguage(s)) return null;
  return s;
}

// A name from an old journal, made presentable rather than refused: older
// app versions stored the identifier's names as they came ("Buteo
// jamaicensis?", "Passer domesticus, female"). Anything outside the allowed
// characters is dropped. Returns null only when nothing usable is left or
// what is left is blocked language.
export function tidyName(value: unknown, maxLength = 80): string | null {
  if (typeof value !== 'string') return null;
  const s = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}'’.×\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 7)
    .join(' ')
    .slice(0, maxLength)
    .trim();
  return s.length >= 2 && /^\p{L}/u.test(s) && !hasBlockedLanguage(s) ? s : null;
}
