import { useAuthStore } from '@/state/useAuthStore';

// Seeds Scout's per-player choices (which weekly quests) so
// they're stable for a player across devices and different between players.
export function crewSeed(): string {
  return useAuthStore.getState().session?.user?.id ?? 'local';
}
