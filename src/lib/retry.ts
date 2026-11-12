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
