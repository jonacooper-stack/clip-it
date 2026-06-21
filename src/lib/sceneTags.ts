// Controlled behavior/scene vocabulary — mirrors the `scene_tags` table in
// supabase/migrations/0001_init.sql. The server is the source of truth for
// multipliers; this copy drives the mock identifier and the UI labels.

export interface SceneTagMeta {
  code: string;
  label: string;
  emoji: string;
  multiplier: number;
  requiresReview: boolean;
}

export const SCENE_TAGS: Record<string, SceneTagMeta> = {
  with_young: { code: 'with_young', label: 'With young', emoji: '🐾', multiplier: 3, requiresReview: false },
  predation: { code: 'predation', label: 'Predation', emoji: '⚡', multiplier: 3, requiresReview: true },
  in_flight: { code: 'in_flight', label: 'In flight', emoji: '🪶', multiplier: 1.5, requiresReview: false },
  courtship: { code: 'courtship', label: 'Courtship', emoji: '💞', multiplier: 2, requiresReview: false },
  group_herd: { code: 'group_herd', label: 'Group / herd', emoji: '🦌', multiplier: 1.5, requiresReview: false },
};

export function sceneTagMeta(code: string): SceneTagMeta | undefined {
  return SCENE_TAGS[code];
}
