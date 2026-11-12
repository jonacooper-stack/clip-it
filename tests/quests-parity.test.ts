// The leaderboard score is worked out by the server from the cloud journal.
// It must be the number the phone shows for the same journal, wherever the
// player lives: same weeks, same weekly quests, same rewards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeStatus, playerTotals, seededRandom, weeklyChallenges, type QuestSighting } from '../shared/quests';
import { ianaZone, localZone } from '../shared/zone';

const SPECIES: [string, string][] = [
  ['Turdus migratorius', 'bird'], ['Cyanocitta cristata', 'bird'], ['Cardinalis cardinalis', 'bird'], ['Buteo jamaicensis', 'bird'],
  ['Sciurus carolinensis', 'mammal'], ['Odocoileus virginianus', 'mammal'], ['Vulpes vulpes', 'mammal'], ['Procyon lotor', 'mammal'],
  ['Chelydra serpentina', 'reptile'], ['Lithobates catesbeianus', 'amphibian'], ['Danaus plexippus', 'insect'], ['Salvelinus fontinalis', 'fish'],
];

// A made-up but repeatable journal: about 300 sightings over 14 months, at all hours.
function journal(seed: string): QuestSighting[] {
  const rand = seededRandom(seed);
  const start = Date.UTC(2025, 8, 1);
  const out: QuestSighting[] = [];
  for (let i = 0; i < 300; i++) {
    const [sci, group] = SPECIES[Math.floor(rand() * SPECIES.length)];
    const roll = rand();
    out.push({
      idStatus: roll < 0.06 ? 'ineligible' : roll < 0.1 ? 'rejected' : roll < 0.2 ? 'disputed' : 'ai_confident',
      points: roll < 0.1 ? undefined : 1 + Math.floor(rand() * 40),
      observedAt: start + Math.floor(rand() * 425 * 86_400_000),
      species: { scientificName: sci, commonName: sci, group: rand() < 0.9 ? group : undefined },
      sceneTags: rand() < 0.2 ? ['in_flight'] : [],
      science: rand() < 0.25 ? { count: ['1'] } : undefined,
      score: { basePoints: 1 + Math.floor(rand() * 12) },
    });
  }
  return out;
}

const ZONES = ['UTC', 'America/Los_Angeles', 'America/Santiago', 'Europe/Berlin', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Auckland'];
const now = Date.UTC(2026, 10, 12, 20);

for (const tz of ZONES) {
  test(`server totals equal the phone's for a player in ${tz}`, () => {
    process.env.TZ = tz;
    const zone = ianaZone(tz);
    for (const seed of ['player-a', 'player-b', '11111111-1111-4111-8111-111111111111']) {
      const sightings = journal(`${seed}:${tz}`);
      const phone = playerTotals(sightings, { seed, zone: localZone, now });
      const server = playerTotals(sightings, { seed, zone, now });
      assert.deepEqual(server, phone);
      assert.ok(phone.questPoints > 0, 'the made-up journal should complete some quests');

      // Week by week: the same three quests, the same progress.
      const weeks = [...new Set(sightings.map((s) => localZone.startOfWeek(s.observedAt)))];
      for (const w of weeks) {
        assert.equal(zone.startOfWeek(w + 3 * 86_400_000), w);
        assert.deepEqual(weeklyChallenges(w, seed, zone).map((c) => c.id), weeklyChallenges(w, seed, localZone).map((c) => c.id));
        const a = challengeStatus(w, sightings, seed, (s) => s.species?.group, zone).map((c) => [c.def.id, c.progress, c.done, c.doneAt]);
        const b = challengeStatus(w, sightings, seed, (s) => s.species?.group, localZone).map((c) => [c.def.id, c.progress, c.done, c.doneAt]);
        assert.deepEqual(a, b);
      }
    }
  });
}

test('a different zone can give a different answer (so the server must use the player\'s)', () => {
  process.env.TZ = 'UTC';
  // Sunday 23:30 in Los Angeles is already Monday in UTC: a different week.
  const t = Date.UTC(2026, 10, 9, 7, 30);
  assert.notEqual(ianaZone('America/Los_Angeles').startOfWeek(t), ianaZone('UTC').startOfWeek(t));
});
