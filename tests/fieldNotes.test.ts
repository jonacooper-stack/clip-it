import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFieldNotes, FIELD_NOTE_ANSWERS } from '../shared/fieldNotes';
import { SCIENCE_QUESTIONS } from '../src/lib/scienceQuestions';

test('the server\'s list of field-note answers matches the questions the app asks', () => {
  assert.deepEqual(
    FIELD_NOTE_ANSWERS,
    Object.fromEntries(SCIENCE_QUESTIONS.map((q) => [q.id, q.options.map((o) => o.value)])),
    'a question or option changed in src/lib/scienceQuestions.ts: update shared/fieldNotes.ts to match',
  );
});

test('only real questions and real options are kept', () => {
  assert.deepEqual(cleanFieldNotes({ count: ['2-5'], habitat: ['forest', 'water', 'forest', 'moon'], made_up: ['x'], behavior: 'feeding' }), {
    count: ['2-5'], habitat: ['forest', 'water'], behavior: ['feeding'],
  });
  assert.equal(cleanFieldNotes({ count: ['999'], other: ['1'] }), null);
  assert.equal(cleanFieldNotes(null), null);
  assert.equal(cleanFieldNotes('count'), null);
  assert.equal(cleanFieldNotes([['count', '1']]), null);
  // at most one point per real question, however the answers are sent
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, ['1']]));
  assert.equal(cleanFieldNotes({ ...many, count: ['1'] })!.count.length, 1);
  assert.equal(Object.keys(cleanFieldNotes({ ...many, count: ['1'], lifeStage: ['adult'] })!).length, 2);
});
