import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient, DAILY_LIMITS, dailyLimitReached, rateLimited, secondsToUtcMidnight, usedToday, verifyPlayer } from './_lib/server';
import { askText, ConfigError, ModelRefusal } from './_lib/claude';
import {
  detectMediaType, IDENTIFY_SYSTEM, IDENTIFY_USER, MAX_IMAGE_BASE64, normalizeIdentification, parseModelJson, refuse, stripDataUrl,
  type Identification,
} from './_lib/identifyCore';
import {
  IMPORT_MESSAGE, JournalBusy, noteTimeZone, publicRow, recordSighting, refreshTotals, validSightingId, withJournalLock,
  type JournalRow, type PublicRow, type Totals,
} from './_lib/journal';
import { supabaseJournalDb } from './_lib/journalDb';
import { photoFingerprint, type Fingerprint } from './_lib/phash';
import { signReceipt, type ReceiptPayload } from './_lib/receipt';
import { importLooksGenuine, type PhotoEvidence } from '../shared/photoEvidence';
import { approxPlace } from '../shared/place';

// Real Claude identification. The app POSTs a base64 photo; we return species +
// behavior tags + a rarity estimate, and the app's scoring engine turns that
// into points. The ANTHROPIC_API_KEY is a server-only Vercel env var — never
// exposed to the app. The prompt and the rules for reading the model's answer
// live in _lib/identifyCore.ts; the model is chosen in _lib/claude.ts.
//
// Only signed-in ClipIt players may call this endpoint (it spends Anthropic
// credit per request), within a per-minute burst limit and a daily allowance.
//
// When the app says which sighting the photo is for (`sightingId`, with when
// and roughly where it was taken), a result that counts is also written to
// the player's cloud journal and scored here: the answer then carries the
// points. That happens only for an account that has answered the age question
// and said yes to having its journal saved; the app sends those details only
// then. If the sighting can't be recorded right now, the answer carries a
// signed `receipt` instead and the app has it recorded on its next sync. A
// request with only the photo gets exactly the answer it always did, and
// nothing about it is kept.
//
// What the app says about a photo (taken with the camera or uploaded, whether
// it carries camera details) is a hint, not proof: anyone can call this
// endpoint. The brakes that don't depend on it are the photo checks the
// server makes itself and the daily limits below.
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

const LIMIT_MESSAGES = {
  score: 'You’ve reached today’s limit for scored sightings. We identified this one, but it won’t add to your score. The limit resets tomorrow.',
  refused: 'Several photos today couldn’t be confirmed as your own, so scoring is paused until tomorrow. You can still identify animals.',
};

// The app gives up on the whole request after 28 s (and then queues the
// capture and asks again). So everything here works to one deadline counted
// from the start of the request: the model may take up to 24 s of it, and
// recording the sighting gets what is left, at most RECORD_BUDGET_MS. If
// there isn't time, the answer goes out with a receipt and the sighting is
// recorded on the app's next sync.
const ANSWER_BY_MS = 26_500;
const RECORD_BUDGET_MS = 2500;
const LOOKUP_BUDGET_MS = 700;

// What the app said about the capture, checked and tidied. Everything here
// is optional: older app builds send none of it.
interface CaptureMeta {
  sid: string | null;
  observedAt: number;
  loggedAt: number;
  /** To two decimals: the exact spot is never kept, or put in a receipt. */
  lat: number | null;
  lng: number | null;
  capture: 'camera' | 'library' | null;
  evidence: PhotoEvidence | null;
  tz: unknown;
}

function readMeta(b: Record<string, unknown>, now: number): CaptureMeta {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const time = (v: unknown, fallback: number) => {
    const t = n(v);
    return t != null && t > Date.UTC(2015, 0, 1) && t < now + 86_400_000 ? t : fallback;
  };
  const place = approxPlace(b.lat, b.lng);
  const e = b.evidence && typeof b.evidence === 'object' ? (b.evidence as Record<string, unknown>) : null;
  const observedAt = time(b.observedAt, now);
  return {
    sid: validSightingId(b.sightingId) ? b.sightingId : null,
    observedAt,
    loggedAt: time(b.loggedAt, now),
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    capture: b.capture === 'camera' || b.capture === 'library' ? b.capture : null,
    evidence: e ? { camera: e.camera === true, screenshot: e.screenshot === true, generator: e.generator === true } : null,
    tz: b.tz,
  };
}

const journalOn = () => process.env.JOURNAL_SYNC !== 'off';

// The refusals that count toward the day's pause: a wild animal turned down
// by the picture check or by the copy check. Not a pet or a person (they
// could never have scored, on a screen or not), not an upload without camera
// details (a fixed rule with nothing to try out), and not "couldn't compare"
// (which says nothing against the player).
const COUNTED_REFUSALS: ReadonlySet<string> = new Set(['screen', 'print', 'screenshot', 'artwork', 'watermark', 'synthetic', 'copied', 'library']);

// What the app is told about how the picture was judged: whether it can
// score and why not. (The server's own doubts stay on the server.)
const shown = (id: Identification) => ({ ...id, authenticity: { ok: id.authenticity.ok, reason: id.authenticity.reason } });

// The identify answer for a sighting that is already in the journal.
function fromJournal(row: JournalRow) {
  const live = !row.deleted_at && Boolean(row.scientific_name);
  return {
    present: live,
    eligible: live,
    category: 'wild_animal',
    species: { scientificName: row.scientific_name ?? '', commonName: row.common_name ?? '', confidence: row.confidence ?? 0, group: row.taxon_group ?? 'other' },
    rarityScore: 0,
    sceneTags: row.scene_tags ?? [],
    caption: row.caption ?? '',
    dangerous: row.dangerous,
    idStatus: live ? (row.status === 'needs_review' ? 'needs_review' : 'ai_confident') : 'rejected',
    ineligibleReason: '',
    authenticity: { ok: true, reason: null },
    recorded: true,
    journal: publicRow(row),
    modelVersion: row.model ?? undefined,
  };
}

// Resolve with the promise's value, or undefined if it takes longer than `ms`.
function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms).unref?.())]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const started = Date.now();
  const timeLeft = () => ANSWER_BY_MS - (Date.now() - started);

  // (freshAge: an account that has just answered the age question is let in
  // at once, not after the server's minute-long memory of "not answered".)
  const player = await verifyPlayer(req.headers.authorization, logFailure, { freshAge: true });
  if (!player) return res.status(401).json({ error: 'sign in required', detail: 'Please sign in to identify sightings.' });
  const userId = player.userId;
  if (rateLimited(`identify:${userId}`, RATE_MAX)) {
    logFailure('rate_limited', { userId });
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'too many requests', detail: 'Slow down a little — try again in a minute.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  // The app says which account it believes it is acting for. If that isn't
  // the account the sign-in belongs to (someone else signed in on the phone
  // while a photo was waiting to be sent), refuse rather than record one
  // person's sighting in another's journal.
  if (typeof body.account === 'string' && body.account !== userId) return res.status(409).json({ error: 'signed in as a different account' });
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

  const meta = readMeta(body, Date.now());
  // Nothing is recorded for an account that hasn't answered the age question
  // (13 and up only): the photo is identified, and that is all.
  if (!player.ageCleared) meta.sid = null;

  // A sighting the server has already identified and recorded (the app was
  // closed before the answer arrived, and is asking again), or one the player
  // has deleted since: answer from the journal. The model isn't called
  // twice, and the answer can't disagree with what was recorded. (A row that
  // only rests on the phone's word is identified now, and takes its place.)
  if (meta.sid && journalOn()) {
    const db = adminClient();
    if (db) {
      try {
        const known = await within(supabaseJournalDb(db).getRow(userId, meta.sid), LOOKUP_BUDGET_MS);
        if (known && (known.verified || known.deleted_at)) return res.status(200).json(fromJournal(known));
      } catch {
        // can't tell: carry on and identify it
      }
    }
  }

  if (await dailyLimitReached(adminClient(), userId, 'identify')) {
    logFailure('daily_limit', { userId });
    // The allowance resets at midnight UTC: tell the app not to ask before then.
    res.setHeader('Retry-After', String(secondsToUtcMidnight()));
    return res.status(429).json({ error: 'daily limit reached', detail: 'You’ve reached today’s limit for identifying photos. It resets tomorrow.' });
  }

  try {
    const asked = askText({
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
    // While the model looks at the photo, take its fingerprints (used to spot
    // the same picture handed in twice). Only needed when it may be recorded.
    // (Wait a moment first: fingerprinting keeps this process busy for a
    // tenth of a second or so, and started straight away it would hold up
    // the request to the model for that long.)
    let print: Fingerprint = { sha: '', phash: null, mask: null };
    if (meta.sid) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      try {
        print = photoFingerprint(imageBase64);
      } catch {
        // no fingerprint: the copy check is skipped for this photo
      }
    }
    const { text, usage } = await asked;
    let id: Identification = normalizeIdentification(parseModelJson(text));

    // An upload from the camera roll has to look like it came out of a camera
    // (IMPORT_CHECK=off in the environment turns this rule off without a
    // deploy). An updated app always says how the photo was captured; when it
    // doesn't (or says "uploaded" without saying what the photo carries), the
    // photo is treated as an upload with no camera details.
    const upload = meta.sid ? meta.capture !== 'camera' : meta.capture === 'library';
    const evidence = meta.sid && !meta.evidence ? { camera: false, screenshot: false, generator: false } : meta.evidence;
    if (id.eligible && upload && process.env.IMPORT_CHECK !== 'off' && !importLooksGenuine(evidence)) {
      id = refuse(id, 'import', IMPORT_MESSAGE);
    }

    // Record it in the player's journal and score it.
    let journal: { receipt?: string; recorded: boolean; journal?: PublicRow; totals?: Totals | null; journalOff?: boolean } | undefined;
    // The daily counts are kept whatever JOURNAL_SYNC says: receipts are
    // handed out while it is off, and are recorded when it is back on.
    const counters = adminClient();
    const db = meta.sid && journalOn() ? counters : null;
    // Two daily brakes that don't rest on anything the app says: a cap on
    // sightings that may score, and a pause once several photos in one day
    // have been turned down as not the player's own.
    if (id.eligible && meta.sid && counters) {
      if ((await usedToday(counters, userId, 'refused')) >= DAILY_LIMITS.refused) id = refuse(id, 'limit', LIMIT_MESSAGES.refused);
      else if (await dailyLimitReached(counters, userId, 'score')) id = refuse(id, 'limit', LIMIT_MESSAGES.score);
    }
    if (id.eligible && meta.sid && id.idStatus !== 'rejected' && id.idStatus !== 'ineligible') {
      const payload: ReceiptPayload = {
        v: 1, uid: userId, sid: meta.sid, at: Date.now(), observedAt: meta.observedAt, loggedAt: meta.loggedAt,
        lat: meta.lat, lng: meta.lng, capture: meta.capture,
        cameraEvidence: meta.capture === 'library' && meta.evidence ? importLooksGenuine(meta.evidence) : null,
        id: {
          status: id.idStatus, common: id.species.commonName, sci: id.species.scientificName, group: id.species.group,
          confidence: id.species.confidence, rarity: id.rarityScore, tags: id.sceneTags, dangerous: id.dangerous, caption: id.caption,
        },
        sha: print.sha || null, phash: print.phash, mask: print.mask,
        model: usage.model,
      };
      journal = { receipt: signReceipt(payload) ?? undefined, recorded: false };
      const budget = Math.min(RECORD_BUDGET_MS, timeLeft());
      if (db && budget > 500) {
        try {
          const jdb = supabaseJournalDb(db);
          // One request at a time per account (see withJournalLock), and not
          // for longer than the answer can wait.
          const done = await within(
            withJournalLock(jdb, userId, budget - 400, async () => {
              // Only for an account that has said yes to having its journal
              // saved (the choice is the account's: see journal_state.backup).
              const state = await jdb.getState(userId);
              if (state?.backup !== 'yes') return null;
              await noteTimeZone(jdb, userId, meta.tz);
              const out = await recordSighting(jdb, payload, imageBase64, { places: state.save_places === true });
              return { out, totals: out.kind === 'recorded' && out.created ? await refreshTotals(jdb, userId) : null };
            }),
            budget,
          );
          if (done === null) {
            // The account isn't saving its journal: nothing is recorded, and
            // no receipt is handed out either (one kept back could be the
            // best of several tries at the same photo). The app's idea of the
            // choice is out of date: it asks again. If the backup is turned
            // on later, the sighting goes up the usual way for one the server
            // hasn't recorded, and is identified again while its photo is on
            // the phone.
            journal = { recorded: false, journalOff: true };
          } else if (done?.out.kind === 'refused') {
            id = refuse(id, done.out.reason, done.out.message);
            journal = undefined;
          } else if (done?.out.kind === 'later') {
            // An old sighting being checked again on a day when its species
            // (or repeats in general) have scored enough: left as it is, to
            // be sent again tomorrow (the app treats this like today's limit).
            id = refuse(id, 'limit', done.out.message);
            journal = undefined;
          } else if (done?.out.kind === 'recorded') {
            journal = { recorded: true, journal: publicRow(done.out.row), totals: done.totals };
          } else {
            logFailure('journal_record_slow', { userId });
          }
        } catch (err: any) {
          // The sighting isn't lost: the app holds the receipt and syncs it later.
          if (!(err instanceof JournalBusy)) logFailure('journal_record_failed', { userId, detail: String(err?.message ?? err).slice(0, 200) });
        }
      }
    }
    if (!id.authenticity.ok) {
      logFailure('not_own_photo', { userId, why: id.authenticity.reason });
      // Counted per day: after several, scoring pauses until tomorrow (see
      // above). Only the refusals in COUNTED_REFUSALS, and whether or not the
      // photo was to be recorded: trying pictures out without a sighting id
      // must not get around the pause.
      const wild = id.present && id.category === 'wild_animal' && Boolean(id.species.scientificName);
      if (wild && COUNTED_REFUSALS.has(String(id.authenticity.reason)) && counters) await dailyLimitReached(counters, userId, 'refused');
    } else if (id.authenticity.review) {
      logFailure('picture_doubt', { userId, sighting: meta.sid });
    }
    return res.status(200).json({ ...shown(id), ...journal, modelVersion: usage.model });
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
