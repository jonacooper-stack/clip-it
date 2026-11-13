// Working out a player's age range at the age check. Plain functions (no app
// imports), so they can be tested: see tests/age.test.ts.
import type { AgeBracket } from '@/types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Age in whole years from a birth month (1–12) and year. The day isn't asked,
// so a birthday in the current month counts as not reached yet: nobody is
// taken to be older than they might be. (Someone who turned 13 earlier this
// month is asked to come back next month; a 12-year-old is never let in.)
export function ageFrom(year: number, month: number, now: Date = new Date()): number {
  const birthdayPassed = month < now.getMonth() + 1;
  return now.getFullYear() - year - (birthdayPassed ? 0 : 1);
}

export function bracketFor(age: number): AgeBracket {
  if (age < 13) return 'under_13';
  if (age < 18) return '13_17';
  return 'adult';
}
