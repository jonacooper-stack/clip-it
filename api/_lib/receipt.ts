// A signed note the identify endpoint hands back with every result that can
// score. If the sighting can't be written to the cloud journal there and then
// (the database is unreachable, or the app is talking to it later), the app
// presents the note and the server records exactly what it identified,
// without having to trust anything else the app says.
//
// The note is bound to one account and one sighting id, so it can't be moved
// to another account or used to create a second sighting.
import { createHmac, timingSafeEqual } from 'crypto';

export interface ReceiptPayload {
  v: 1;
  uid: string; // the account it was issued to
  sid: string; // the sighting id it was issued for
  at: number; // when it was identified (ms)
  observedAt: number;
  loggedAt: number;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  capture: 'camera' | 'library' | null;
  /** For camera-roll photos: did the photo carry a camera's details? */
  cameraEvidence: boolean | null;
  id: {
    status: 'ai_confident' | 'needs_review';
    common: string;
    sci: string;
    group: string;
    confidence: number;
    rarity: number;
    tags: string[];
    dangerous: boolean;
    caption: string;
  };
  sha: string | null;
  phash: string | null;
  flags: Record<string, unknown> | null;
  model: string;
}

// Receipts older than this are refused: long enough for a phone that was
// offline for weeks, short enough that a leaked note doesn't live forever.
const MAX_AGE_MS = 90 * 86_400_000;

// The signing key: RECEIPT_SECRET if set, otherwise derived from the
// database secret the server already has (never the secret itself).
function key(): Buffer | null {
  const own = process.env.RECEIPT_SECRET;
  if (own) return Buffer.from(own, 'utf8');
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return null;
  return createHmac('sha256', service).update('clipit:receipt:v1').digest();
}

const b64url = (b: Buffer) => b.toString('base64url');

// Returns null when no signing key is configured (then nothing can be
// recorded later, and the app keeps today's on-device scoring).
export function signReceipt(payload: ReceiptPayload): string | null {
  const k = key();
  if (!k) return null;
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(createHmac('sha256', k).update(body).digest());
  return `${body}.${sig}`;
}

// The payload, if the note is genuine, was issued to this account, and (when
// given) is for this sighting. Null otherwise.
export function verifyReceipt(token: unknown, uid: string, sid?: string, now = Date.now()): ReceiptPayload | null {
  const k = key();
  if (!k || typeof token !== 'string' || token.length > 6000) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = createHmac('sha256', k).update(body).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let p: ReceiptPayload;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!p || p.v !== 1 || p.uid !== uid || typeof p.sid !== 'string' || !p.id) return null;
  if (sid != null && p.sid !== sid) return null;
  if (typeof p.at !== 'number' || p.at > now + 600_000 || now - p.at > MAX_AGE_MS) return null;
  return p;
}
