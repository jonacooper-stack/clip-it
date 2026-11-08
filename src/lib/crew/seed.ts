import { useAuthStore } from '@/state/useAuthStore';

// Seeds the crew's per-player choices (which challenges, Kestrel's pace) so
// they're stable for a player across devices and different between players.
export function crewSeed(): string {
  return useAuthStore.getState().session?.user?.id ?? 'local';
}
