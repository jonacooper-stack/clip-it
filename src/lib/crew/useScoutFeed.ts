import { useEffect, useMemo } from 'react';
import { useJournalStore } from '@/state/useJournalStore';
import { useAppStore } from '@/state/useAppStore';
import { useCrewStore } from '@/state/useCrewStore';
import { useAuthStore } from '@/state/useAuthStore';
import { groupOf, questCompletedAt, SEED_QUESTS } from '@/lib/quests';
import { useQuestSightings } from '@/lib/useQuestSightings';
import { weekOf } from '../../../shared/crew';
import { buildMoments } from './moments';
import { challengeStatus } from './challenges';
import { startOfWeek } from './time';
import { discoverableSetting, loadForecast, loadPeople, loadToday, localDate, saveDiscoverable, saveHomeRegion } from './api';

// Scout's posts for the feed and this week's quests, kept in sync with the
// journal. Fetches this week's themes, today's animal and the week's people
// suggestions once each if they aren't cached yet.
export function useScoutFeed() {
  const sightings = useJournalStore((s) => s.sightings);
  const counted = useQuestSightings(); // the journal as quests count it
  const region = useAppStore((s) => s.homeRegion);
  const forecastMap = useCrewStore((s) => s.forecasts);
  const todayMap = useCrewStore((s) => s.today);
  const people = useCrewStore((s) => s.people);
  const hidden = useCrewStore((s) => s.hiddenPhotos);
  const discoverable = useAppStore((s) => s.discoverable);
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
  // People to follow: once a week.
  const peopleStale = !people || Date.now() - people.fetchedAt > 7 * 86_400_000;
  useEffect(() => {
    if (uid && peopleStale) loadPeople().catch(() => {});
  }, [uid, peopleStale]);
  // Once per device: save the privacy default (off for ages 13–17) and the
  // home region to the private settings the server reads.
  useEffect(() => {
    if (!uid || discoverable !== null) return;
    saveDiscoverable(discoverableSetting())
      .then(() => (region ? saveHomeRegion(region) : undefined))
      .catch(() => {});
  }, [uid, discoverable, region]);

  const moments = useMemo(() => {
    const forecasts = Object.values(forecastMap).filter((f) => f.region === region);
    const today = Object.values(todayMap).filter((t) => t.region === region);
    const bigQuests = SEED_QUESTS.map((q) => ({ id: q.id, title: q.title, reward: q.rewardPoints, doneAt: questCompletedAt(q, counted) }));
    return buildMoments({ sightings, questSightings: counted, region, forecasts, today, people, hidden, seed, groupOf, bigQuests });
  }, [sightings, counted, region, forecastMap, todayMap, people, hidden, seed]);

  const quests = useMemo(() => challengeStatus(startOfWeek(Date.now()), counted, seed, groupOf), [counted, seed]);
  return { moments, quests, region };
}
