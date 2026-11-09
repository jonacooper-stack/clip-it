import { useEffect, useMemo } from 'react';
import { useJournalStore } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';
import { useCrewStore } from '@/state/useCrewStore';
import { useAuthStore } from '@/state/useAuthStore';
import { groupOf, questCompletedAt, SEED_QUESTS } from '@/lib/quests';
import { weekOf } from '../../../shared/crew';
import { buildMoments } from './moments';
import { challengeStatus } from './challenges';
import { startOfWeek } from './time';
import { loadForecast, loadToday, localDate } from './api';

// Scout's posts for the feed and this week's quests, kept in sync with the
// journal. Fetches this week's slides and today's animal once if they aren't
// cached yet.
export function useScoutFeed() {
  const sightings = useJournalStore((s) => s.sightings);
  const region = useAppStore((s) => s.homeRegion);
  const forecastMap = useCrewStore((s) => s.forecasts);
  const todayMap = useCrewStore((s) => s.today);
  const uid = useAuthStore((s) => s.session?.user?.id);
  const seed = uid ?? 'local';

  const hasWeek = region ? Boolean(forecastMap[`${region}:${weekOf()}`]) : true;
  const hasToday = region ? Boolean(todayMap[`${region}:${localDate()}`]) : true;
  useEffect(() => {
    if (region && !hasWeek && uid) loadForecast(region).catch(() => {});
  }, [region, hasWeek, uid]);
  useEffect(() => {
    if (region && !hasToday && uid) loadToday(region).catch(() => {});
  }, [region, hasToday, uid]);

  const moments = useMemo(() => {
    const forecasts = Object.values(forecastMap).filter((f) => f.region === region);
    const today = Object.values(todayMap).filter((t) => t.region === region);
    const bigQuests = SEED_QUESTS.map((q) => ({ id: q.id, title: q.title, reward: q.rewardPoints, doneAt: questCompletedAt(q, sightings) }));
    return buildMoments({ sightings, region, forecasts, today, seed, groupOf, bigQuests });
  }, [sightings, region, forecastMap, todayMap, seed]);

  const quests = useMemo(() => challengeStatus(startOfWeek(Date.now()), sightings, seed, groupOf), [sightings, seed]);
  return { moments, quests, region };
}
