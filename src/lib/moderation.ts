import { CREW_RESERVED_NAMES } from '../../shared/crew';
import { hasBlockedLanguage } from '../../shared/moderation';

// Lightweight pre-post filter for objectionable language (App Store Guideline
// 1.2 asks UGC apps to filter objectionable material before it's posted). The
// word list and matching rules live in shared/moderation.ts (the server uses
// the same ones).

// Returns a user-facing message if the text should be blocked, else null.
export function checkText(text: string): string | null {
  return hasBlockedLanguage(text)
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
