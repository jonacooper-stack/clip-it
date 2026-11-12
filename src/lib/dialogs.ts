// Cross-platform alerts. React Native's Alert does nothing on the web (the
// call is silently ignored), so anything a player must see or confirm goes
// through these: native Alert on iOS/Android, the browser's own dialogs on web.
import { Alert, Platform } from 'react-native';

const web = Platform.OS === 'web';

// Tell the player something (an error, a confirmation that something happened).
export function notify(title: string, message?: string): void {
  if (web) (globalThis as any).alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

// Ask before doing something that can't be undone. `onConfirm` runs only if
// the player agrees.
export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void): void {
  ask(title, message, actionLabel, 'Cancel', true, onConfirm);
}

// Ask a plain yes-or-no question (nothing destructive about either answer).
export function askYesNo(title: string, message: string, yesLabel: string, noLabel: string, onYes: () => void, onNo: () => void): void {
  ask(title, message, yesLabel, noLabel, false, onYes, onNo);
}

function ask(title: string, message: string, yesLabel: string, noLabel: string, destructive: boolean, onYes: () => void, onNo?: () => void): void {
  if (web) {
    if ((globalThis as any).confirm?.(`${title}\n\n${message}`)) onYes();
    else onNo?.();
    return;
  }
  Alert.alert(title, message, [
    { text: noLabel, style: 'cancel', onPress: onNo },
    { text: yesLabel, style: destructive ? 'destructive' : 'default', onPress: onYes },
  ]);
}
