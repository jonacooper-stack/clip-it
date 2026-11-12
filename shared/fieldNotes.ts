// The field-note questions and their allowed answers, by id. The app shows
// the questions (labels and wording live in src/lib/scienceQuestions.ts); the
// server uses this list to accept only real answers, since each answered
// question earns a bonus point. A unit test keeps the two in step.
//
// Keep this file free of React Native and Node-only imports.
export const FIELD_NOTE_ANSWERS: Record<string, readonly string[]> = {
  count: ['1', '2-5', '6-20', '20+'],
  habitat: ['forest', 'field', 'water', 'urban', 'coast', 'mountain'],
  behavior: ['feeding', 'resting', 'moving', 'with_young', 'vocalizing'],
  lifeStage: ['adult', 'juvenile', 'mixed', 'unsure'],
};

// A player's answers, reduced to real questions and real options. Accepts the
// old single-string form. Returns null when nothing valid is left.
export function cleanFieldNotes(v: unknown): Record<string, string[]> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, string[]> = {};
  for (const [id, allowed] of Object.entries(FIELD_NOTE_ANSWERS)) {
    const raw = (v as Record<string, unknown>)[id];
    const vals = [...new Set((Array.isArray(raw) ? raw : [raw]).filter((x): x is string => typeof x === 'string' && allowed.includes(x)))];
    if (vals.length) out[id] = vals;
  }
  return Object.keys(out).length ? out : null;
}
