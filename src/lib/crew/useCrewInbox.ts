import { useEffect, useMemo } from 'react';
import { useJournalStore } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';
import { useCrewStore } from '@/state/useCrewStore';
import { useAuthStore } from '@/state/useAuthStore';
import { groupOf } from '@/lib/quests';
import { weekOf } from '../../../shared/crew';
import { buildInbox, unreadCount } from './inbox';
import { loadForecast } from './api';

// Everything the inbox, the feed strip and the bell need, kept in sync with the
// journal. Fetches this week's forecast once if it isn't cached yet.
export function useCrewInbox() {
  const sightings = useJournalStore((s) => s.sightings);
  const region = useAppStore((s) => s.homeRegion);
  const seenAt = useAppStore((s) => s.crewSeenAt);
  const forecasts = useCrewStore((s) => s.forecasts);
  const uid = useAuthStore((s) => s.session?.user?.id);
  const seed = uid ?? 'local';
  const forecast = region ? forecasts[`${region}:${weekOf()}`] ?? null : null;

  useEffect(() => {
    if (region && !forecast && uid) loadForecast(region).catch(() => {});
  }, [region, forecast, uid]);

  const items = useMemo(
    () => buildInbox({ sightings, region, forecast, seed, groupOf }),
    [sightings, region, forecast, seed],
  );
  return { items, unread: unreadCount(items, seenAt), forecast, region, seed };
}
