import { Alert, Platform } from 'react-native';
import { reportPhoto, type PhotoReportReason } from '@/lib/crew/api';

// "Wrong photo?" for any photo Scout shows. The photo disappears for this
// player right away; one report hides it for everyone (reviewed by the team).
export function askReportPhoto(url: string, opts: { species?: string; context?: string; onDone?: () => void } = {}) {
  const send = (reason: PhotoReportReason) => {
    reportPhoto(url, { species: opts.species, context: opts.context, reason }).catch(() => {});
    opts.onDone?.();
  };
  const what = opts.species ? `a ${opts.species.toLowerCase()}` : 'the right animal';
  if (Platform.OS === 'web') {
    const ok = (globalThis as any).confirm?.(`Report this photo?\n\nTell us if it isn’t ${what}, isn’t a real photo of it, or isn’t OK for ClipIt. We’ll hide it right away.`);
    if (ok) send('wrong_animal');
    return;
  }
  Alert.alert('What’s wrong with this photo?', 'We’ll hide it right away and our team will take a look.', [
    { text: `It isn’t ${what}`, onPress: () => send('wrong_animal') },
    { text: 'Not a real photo of it', onPress: () => send('not_a_photo_of_it') },
    { text: 'Not OK for ClipIt', onPress: () => send('inappropriate') },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
