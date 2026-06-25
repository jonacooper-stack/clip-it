// Optional, quick-tap questions shown after an identification. These mirror the
// fields citizen-science platforms (iNaturalist, eBird, GBIF / Darwin Core) value
// most beyond the photo itself — abundance (individualCount), habitat, behavior,
// and life stage. Answers are optional and earn a small bonus point each.

export interface ScienceQuestion {
  id: string;
  /** Darwin Core-ish field this maps to, for future science export. */
  field: string;
  prompt: string;
  why: string;
  options: { value: string; label: string }[];
}

export const SCIENCE_QUESTIONS: ScienceQuestion[] = [
  {
    id: 'count',
    field: 'individualCount',
    prompt: 'How many did you see?',
    why: 'Counts help scientists track whether a species is growing or declining.',
    options: [
      { value: '1', label: 'Just 1' },
      { value: '2-5', label: '2–5' },
      { value: '6-20', label: '6–20' },
      { value: '20+', label: '20+' },
    ],
  },
  {
    id: 'habitat',
    field: 'habitat',
    prompt: 'Where were you?',
    why: 'Habitat shows where species live and how their ranges shift over time.',
    options: [
      { value: 'forest', label: 'Forest' },
      { value: 'field', label: 'Field' },
      { value: 'water', label: "Water's edge" },
      { value: 'urban', label: 'Town / yard' },
      { value: 'coast', label: 'Coast' },
      { value: 'mountain', label: 'Mountains' },
    ],
  },
  {
    id: 'behavior',
    field: 'behavior',
    prompt: 'What was it doing?',
    why: 'Behavior reveals feeding, breeding, and migration patterns.',
    options: [
      { value: 'feeding', label: 'Feeding' },
      { value: 'resting', label: 'Resting' },
      { value: 'moving', label: 'On the move' },
      { value: 'with_young', label: 'With young' },
      { value: 'vocalizing', label: 'Calling' },
    ],
  },
  {
    id: 'lifeStage',
    field: 'lifeStage',
    prompt: 'Adult or young?',
    why: 'The mix of ages tells researchers whether animals are breeding well.',
    options: [
      { value: 'adult', label: 'Adult' },
      { value: 'juvenile', label: 'Young' },
      { value: 'mixed', label: 'Both' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
];

// Show a few questions per sighting. We keep the three core ones (count, habitat,
// behavior) every time and rotate the fourth so it stays fresh without nagging.
export function questionsForSighting(id: string): ScienceQuestion[] {
  const core = SCIENCE_QUESTIONS.slice(0, 3);
  const rotating = SCIENCE_QUESTIONS.slice(3);
  if (rotating.length === 0) return core;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % rotating.length;
  return [...core, rotating[h]];
}

export function answerLabel(questionId: string, value: string): string {
  const q = SCIENCE_QUESTIONS.find((x) => x.id === questionId);
  return q?.options.find((o) => o.value === value)?.label ?? value;
}
