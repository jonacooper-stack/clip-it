// The behaviours the identifier can report, with the labels the app shows.
// What each is worth is decided in shared/scoring.ts (one copy for app and
// server).
import { SCENE_TAG_MULTIPLIERS as M } from '../../shared/scoring';

export interface SceneTagMeta {
  code: string;
  label: string;
  emoji: string;
  multiplier: number;
  requiresReview: boolean;
}

export const SCENE_TAGS: Record<string, SceneTagMeta> = {
  with_young: { code: 'with_young', label: 'With young', emoji: '🐾', multiplier: M.with_young, requiresReview: false },
  predation: { code: 'predation', label: 'Predation', emoji: '⚡', multiplier: M.predation, requiresReview: true },
  in_flight: { code: 'in_flight', label: 'In flight', emoji: '🪶', multiplier: M.in_flight, requiresReview: false },
  courtship: { code: 'courtship', label: 'Courtship', emoji: '💞', multiplier: M.courtship, requiresReview: false },
  group_herd: { code: 'group_herd', label: 'Group / herd', emoji: '🦌', multiplier: M.group_herd, requiresReview: false },
};

export function sceneTagMeta(code: string): SceneTagMeta | undefined {
  return SCENE_TAGS[code];
}
