import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Button } from './Button';
import { colors, spacing, font, fonts } from '@/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/state/useAuthStore';
import { shareToWall } from '@/lib/social';
import type { Sighting } from '@/types';

// Lets a user post an identified sighting to the community wall. De-identified —
// only species, points, and caption go up, never the location. Renders nothing
// unless accounts are on, the user is signed in, and it's a real animal ID.
export function ShareToWall({ sighting }: { sighting: Sighting }) {
  const session = useAuthStore((s) => s.session);
  const [state, setState] = useState<'idle' | 'sharing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const eligible =
    !!sighting.species &&
    (sighting.idStatus === 'ai_confident' || sighting.idStatus === 'human_confirmed');
  if (!isSupabaseConfigured || !session || !eligible) return null;

  if (state === 'done') {
    return (
      <Card style={styles.done}>
        <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
        <Text style={styles.doneText}>Shared to the wall</Text>
      </Card>
    );
  }

  const share = async () => {
    setState('sharing');
    setErrorMsg(null);
    const res = await shareToWall({
      commonName: sighting.species?.commonName,
      scientificName: sighting.species?.scientificName,
      points: sighting.points,
      caption: sighting.caption,
      photoUri: sighting.photoUri,
    });
    if (res.error) {
      setErrorMsg(res.error);
      setState('error');
    } else {
      setState('done');
    }
  };

  return (
    <>
      <Button
        label={state === 'error' ? 'Couldn’t share — try again' : 'Share to wall'}
        variant="secondary"
        icon="share-social"
        loading={state === 'sharing'}
        onPress={share}
        style={styles.btn}
      />
      {state === 'error' && !!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  btn: { marginTop: spacing.md },
  done: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  doneText: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  errorText: { fontSize: font.tiny, color: colors.danger, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
});
