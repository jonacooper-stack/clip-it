// When to retry a queued capture the server answered for but couldn't
// identify (a server error, a photo it had trouble with). Each try uploads the
// photo and may spend AI credit, so the waits grow and the tries are capped: a
// capture that keeps failing must not be retried forever. Players can still
// retry it by hand. (Plain functions, no app imports: see tests/retry.test.ts.)

export const RETRY_WAITS_MS = [30_000, 2 * 60_000, 10 * 60_000, 3600_000, 6 * 3600_000];
export const MAX_AUTO_RETRIES = 8;

export interface Retry {
  attempts: number;
  nextAt: number;
  /** Set when the wait isn't after a failed try: today's allowance for scored sightings is used up. */
  why?: 'limit';
}

// The retry record after `attempts` failed tries.
export function nextRetry(attempts: number, now = Date.now()): Retry {
  const step = Math.min(Math.max(attempts, 1), RETRY_WAITS_MS.length) - 1;
  return { attempts, nextAt: now + RETRY_WAITS_MS[step] };
}

// Whether the queue should try this capture now.
export function dueForRetry(retry: Retry | undefined, now = Date.now()): boolean {
  return !retry || (retry.attempts < MAX_AUTO_RETRIES && now >= retry.nextAt);
}

// The server's daily allowances reset at midnight UTC.
const DAY_MS = 86_400_000;
export function msToDailyReset(now = Date.now()): number {
  return DAY_MS - (now % DAY_MS) + 60_000; // a minute past, to be on the safe side of the clocks
}

// Hold a capture until then (today's allowance for sightings that score is
// used up). Not a failed try: the count of those stays as it was.
export function holdUntilReset(retry: Retry | undefined, now = Date.now()): Retry {
  return { attempts: retry?.attempts ?? 0, nextAt: now + msToDailyReset(now), why: 'limit' };
}

// How long to hold the whole queue after the server said "too many requests".
// It names the wait itself (a minute for a burst, until midnight UTC when the
// day's allowance is used up); never less than a minute, never more than a day.
export function retryWaitMs(retryAfterS: number | undefined): number {
  const s = typeof retryAfterS === 'number' && Number.isFinite(retryAfterS) ? retryAfterS : 60;
  return Math.min(Math.max(s, 60), 86_400) * 1000;
}
