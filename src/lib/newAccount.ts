// Was the signed-in account created just now, in this version of the app?
//
// Such an account signed up under the current privacy policy (which says the
// journal is saved to the account), so its journal is saved without a
// separate question. Every other account, one from before this version, or
// one we can't be sure about, is asked first.
//
// "In this version" matters: a freshly installed app runs the version it
// shipped with for its first session, so an account can be minutes old and
// still have been created under the earlier policy. Only this version leaves
// the note that `startedAt` comes from.
//
// A plain function (no app imports), so it can be tested: tests/newAccount.test.ts.

export const NEW_ACCOUNT_WINDOW_MS = 15 * 60_000;

// `createdAt`: when the account was created (from the session).
// `startedAt`: when someone last began creating an account on this device in
// this version of the app (null: never).
export function createdHere(createdAt: string | undefined | null, startedAt: number | null, now: number): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(created) || startedAt == null || !Number.isFinite(startedAt)) return false;
  return now - startedAt >= 0 && now - startedAt < NEW_ACCOUNT_WINDOW_MS && now - created < NEW_ACCOUNT_WINDOW_MS && created >= startedAt - 60_000;
}
