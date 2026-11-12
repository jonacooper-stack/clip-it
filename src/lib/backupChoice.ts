// The player's choice about saving their journal to their account.
//
// The choice belongs to the account, not to one phone: the app tells the
// server, the server records it, and every device follows it (see
// lib/journalSync). This file holds the question itself and the defaults.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { askYesNo } from './dialogs';
import { createdHere } from './newAccount';
import { useAppStore } from '@/state/useAppStore';
import { setCloudChoice, useJournalStore } from '@/state/useJournalStore';

const SIGNUP_KEY = 'clipit-signup-started';

// Someone has begun creating an account in this version of the app (the
// sign-up form, or Continue with Google / Apple). See lib/newAccount.
export function noteSignupStarted(): void {
  AsyncStorage.setItem(SIGNUP_KEY, String(Date.now())).catch(() => {});
}

export async function accountCreatedHere(createdAt: string | undefined): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SIGNUP_KEY);
    return createdHere(createdAt, raw ? Number(raw) : null, Date.now());
  } catch {
    return false;
  }
}

// Whether places are saved with the journal, when the player hasn't chosen:
//   ages 13–17   off (they can switch it on in Profile);
//   adults       on once the app is allowed to use their location, and not
//                before. `undefined` here means "not yet": it counts as off.
export async function defaultPlaces(): Promise<boolean | undefined> {
  if (useAppStore.getState().ageBracket !== 'adult') return false;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted' ? true : undefined;
  } catch {
    return undefined;
  }
}

// An adult who hadn't allowed location when the backup was turned on, and
// has since: places start being saved (the switch in Profile shows it, and
// turns it off again).
export async function applyPlacesDefault(uid: string): Promise<void> {
  const cloud = useJournalStore.getState().cloud;
  if (cloud?.backup !== true || cloud.places !== undefined || (cloud.saved && cloud.saved.places !== null)) return;
  const places = await defaultPlaces();
  if (places === true && useJournalStore.getState().owner === uid && useJournalStore.getState().cloud?.places === undefined) setCloudChoice({ places: true });
}

// Record the answer for the account whose journal is loaded.
export async function chooseBackup(uid: string, yes: boolean): Promise<void> {
  const places = yes ? await defaultPlaces() : undefined;
  if (useJournalStore.getState().owner !== uid) return;
  setCloudChoice(yes ? { backup: true, places } : { backup: false });
}

let askedThisSession: string | null = null;

// Ask an account that has never answered. Once per app session unless the
// player asks for it (the Profile row). `then` runs after either answer.
export function askAboutBackup(uid: string, opts: { again?: boolean; then?: () => void } = {}): void {
  if (!opts.again && askedThisSession === uid) return;
  askedThisSession = uid;
  const teen = useAppStore.getState().ageBracket !== 'adult';
  askYesNo(
    'Save your journal to your account?',
    'ClipIt can now keep your journal with your account: each sighting’s species, time and a copy of its photo' +
      (teen ? '.' : ', and roughly where you took it unless you switch places off.') +
      ' Other players can’t see it. A new phone or a reinstall won’t lose it, and from now on it is how your score counts on the leaderboard.\n\nYou can stop this in Profile at any time.',
    'Save my journal',
    'Not now',
    () => void chooseBackup(uid, true).then(opts.then),
    () => void chooseBackup(uid, false).then(opts.then),
  );
}
