import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeRewardPoints, challengeStatus, CHALLENGE_POOL, SWEEP_BONUS, weeklyChallenges } from '../src/lib/crew/challenges';
import { startOfWeek } from '../src/lib/crew/time';
import type { Sighting } from '../src/types';

const week = startOfWeek(new Date(2026, 10, 12, 12).getTime()); // Monday 9 Nov 2026, local
const groupOf = (s: Sighting) => s.species?.group;
let n = 0;
const sighting = (dayOffset: number, common: string, group: string, extra: Partial<Sighting> = {}): Sighting => {
  const t = week + dayOffset * 86_400_000 + 10 * 3600_000 + n++ * 1000;
  return { id: `s${n}`, createdAt: t, observedAt: t, sceneTags: [], idStatus: 'ai_confident', points: 2, species: { commonName: common, scientificName: common, confidence: 0.9, group }, ...extra };
};

test('each week has three quests: two from the main pool and one easy one, stable for a player', () => {
  const a = weeklyChallenges(week, 'player-1');
  assert.equal(a.length, 3);
  assert.equal(a.filter((c) => c.easy).length, 1);
  assert.equal(new Set(a.map((c) => c.id)).size, 3);
  assert.deepEqual(weeklyChallenges(week, 'player-1').map((c) => c.id), a.map((c) => c.id)); // same again
  assert.ok(CHALLENGE_POOL.length >= 6);
});

test('progress is counted from the week\'s sightings and capped at the goal', () => {
  const seen = [sighting(0, 'Robin', 'bird'), sighting(1, 'Blue jay', 'bird'), sighting(2, 'Cardinal', 'bird'), sighting(2, 'Pet dog', 'mammal', { idStatus: 'ineligible' })];
  const birds = CHALLENGE_POOL.find((c) => c.id === 'birds')!;
  assert.equal(birds.progress({ week: seen.filter((s) => s.idStatus !== 'ineligible'), before: [], groupOf }), 3);
  const status = challengeStatus(week, seen, 'seed', groupOf);
  for (const c of status) {
    assert.ok(c.progress <= c.def.goal);
    assert.equal(c.done, c.progress >= c.def.goal);
    if (c.done) assert.ok(c.doneAt && c.doneAt >= week);
  }
});

test('sightings outside the week, or that did not count, are ignored', () => {
  const lastWeek = [sighting(-3, 'Robin', 'bird'), sighting(-2, 'Blue jay', 'bird')];
  const status = challengeStatus(week, lastWeek, 'seed', groupOf);
  assert.ok(status.every((c) => c.progress === 0));
});

test('reward points add up across weeks, with the bonus for finishing all three', () => {
  assert.equal(challengeRewardPoints([], 'seed', groupOf), 0);
  // A very busy week: enough of everything to finish any three quests.
  const busy: Sighting[] = [];
  const kinds: [string, string][] = [['Robin', 'bird'], ['Blue jay', 'bird'], ['Red fox', 'mammal'], ['Raccoon', 'mammal'], ['Bullfrog', 'amphibian'], ['Garter snake', 'reptile'], ['Monarch', 'insect']];
  kinds.forEach(([name, group], i) =>
    busy.push(sighting(i % 5, name, group, { sceneTags: ['in_flight'], science: { count: ['1'] }, score: { basePoints: 6, behaviorMultiplier: 1, bonuses: { firstOfSpecies: 5, quest: 0, streak: 0, fieldNotes: 0 }, totalPoints: 6, ruleVersion: 'v' } })),
  );
  const status = challengeStatus(week, busy, 'seed', groupOf);
  assert.ok(status.every((c) => c.done), status.map((c) => `${c.def.id}:${c.progress}/${c.def.goal}`).join(' '));
  const expected = status.reduce((sum, c) => sum + c.def.reward, 0) + SWEEP_BONUS;
  assert.equal(challengeRewardPoints(busy, 'seed', groupOf, week + 8 * 86_400_000), expected);
});
