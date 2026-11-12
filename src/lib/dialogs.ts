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
  if (web) {
    if ((globalThis as any).confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
