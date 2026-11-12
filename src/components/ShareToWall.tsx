import { useState } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Button } from './Button';
import { colors, spacing, font, fonts } from '@/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/state/useAuthStore';
import { useJournalStore } from '@/state/useJournalStore';
import { shareToWall, friendlyError } from '@/lib/social';
import { fetchCrewNotes } from '@/lib/crew/api';
import type { Sighting } from '@/types';

// Lets a user post an identified sighting to the community wall. De-identified —
// only species, points, and caption go up, never the location. Renders nothing
// unless accounts are on, the user is signed in, and it's a real animal ID.
export function ShareToWall({ sighting }: { sighting: Sighting }) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const editSighting = useJournalStore((s) => s.editSighting);
  const [state, setState] = useState<'idle' | 'sharing' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Once the server keeps this account's journal, only a sighting it has
  // recorded can be shared: the post takes its points and species from the
  // journal, and the photo is one the server has already checked.
  const serverKeepsJournal = useJournalStore((s) => s.cloud?.ready === true);
  const eligible =
    !!sighting.species &&
    (sighting.idStatus === 'ai_confident' || sighting.idStatus === 'human_confirmed') &&
    (!serverKeepsJournal || Boolean(sighting.cloudAt));
  if (!isSupabaseConfigured || !session || !eligible) return null;

  // Already on the wall (remembered on the sighting, so it can't be posted
  // twice): link to the post instead of offering to share again.
  if (sighting.wallPostId) {
    return (
      <Card style={styles.done}>
        <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
        <Text style={styles.doneText}>Shared to the wall</Text>
        <Pressable onPress={() => router.push(`/post/${sighting.wallPostId}`)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.view}>View post</Text>
        </Pressable>
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
      sightingId: sighting.id,
    });
    if (res.error) {
      setErrorMsg(friendlyError(res.error, 'Couldn’t share right now. Please try again in a moment.'));
      setState('error');
    } else {
      setState('idle');
      if (res.postId) {
        editSighting(sighting.id, { wallPostId: res.postId });
        // Scout drops a fun fact on the new post (and Scout's notes refresh).
        fetchCrewNotes(sighting.id, { postId: res.postId }).catch(() => {});
      }
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
  doneText: { flex: 1, fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.onPrimary },
  view: { fontSize: font.small, fontFamily: fonts.bodyBold, color: colors.primary, textDecorationLine: 'underline' },
  errorText: { fontSize: font.tiny, color: colors.danger, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
});
