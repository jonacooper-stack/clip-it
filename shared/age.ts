// ClipIt is for ages 13 and up. The age question is answered once and only
// the range is kept ("13_17" or "adult"), on the device and on the account.
//
// Version 1 of the question asked the birth year only, which let in someone
// who turns 13 later in the year. Version 2 asks the month as well. So a
// 13–17 answer counts as settled only if it came from version 2; an adult
// answer from either version is fine (nobody near 13 is filed as an adult).
//
// Until the question is settled for an account, nothing from its journal is
// saved to the account: the app doesn't send it, and the server refuses it.
//
// Keep this file free of React Native and Node-only imports.

export const AGE_CHECK_VERSION = 2;

export function ageIsSettled(bracket: unknown, check: unknown): boolean {
  if (bracket === 'adult') return true;
  return bracket === '13_17' && typeof check === 'number' && check >= AGE_CHECK_VERSION;
}
