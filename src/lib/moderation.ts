// Moderation — reporting content and blocking people.
//
// Required for any app that shows users each other's content (App Store Review
// Guideline 1.2, Google Play UGC policy): a report path, a block path, and
// filtering so a block actually takes effect.
//
// Blocks are enforced in two places on purpose. The database policies in
// supabase/migrations/0006_moderation.sql stop a blocked user reading the rows at
// all; the client-side filter here keeps already-loaded lists consistent and
// covers the tables whose policies aren't block-aware (likes, follows, friendships).

import { supabase } from './supabase';
import { useAuthStore } from '@/state/useAuthStore';

export type ReportTargetType = 'post' | 'comment' | 'user';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'nudity'
  | 'violence'
  | 'animal_harm'
  | 'misidentification'
  | 'other';

// The picker order is the order people actually need them in.
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence or graphic content' },
  { value: 'animal_harm', label: 'Harming or harassing wildlife' },
  { value: 'spam', label: 'Spam or a scam' },
  { value: 'misidentification', label: 'Wrong species / not wildlife' },
  { value: 'other', label: 'Something else' },
];

function myId(): string | null {
  return useAuthStore.getState().session?.user?.id ?? null;
}

export interface ReportInput {
  targetType: ReportTargetType;
  postId?: string;
  commentId?: string;
  targetUserId?: string;
  reason: ReportReason;
  details?: string;
}

// File a report. Reporting the same thing twice is a no-op rather than an error —
// the unique constraint catches it and there's nothing useful to tell the user.
export async function reportContent(input: ReportInput): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: uid,
    target_type: input.targetType,
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    target_user_id: input.targetUserId ?? null,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  if (error && !isDuplicate(error)) return { error: error.message };
  return {};
}

function isDuplicate(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || /duplicate key/i.test(error.message ?? '');
}

// --- blocking ---

export async function blockUser(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: uid, blocked_id: userId });
  if (error && !isDuplicate(error)) return { error: error.message };
  // A block should end the relationship too, or they'd stay in each other's
  // friends list and following feed with the content silently missing.
  await Promise.all([
    supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', userId),
    supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', uid),
    supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${uid},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${uid})`,
      ),
  ]);
  return {};
}

export async function unblockUser(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', userId);
  return error ? { error: error.message } : {};
}

export interface BlockedUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

// Everyone I've blocked, for the "Blocked explorers" management screen. The 0006
// profiles policy deliberately still lets a blocker read the profiles they
// blocked, so this screen shows real names rather than a list of placeholders.
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const uid = myId();
  if (!supabase || !uid) return [];
  const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid);
  const ids = (data ?? []).map((r: any) => r.blocked_id as string);
  if (!ids.length) return [];
  // Falls back to a placeholder if 0006 hasn't been applied yet, or the account
  // has since been deleted.
  const { data: profs } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids);
  const byId = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
  return ids.map((id) => ({
    id,
    displayName: byId.get(id)?.display_name || 'Blocked explorer',
    avatarUrl: byId.get(id)?.avatar_url ?? null,
  }));
}

// Ids involved in a block with me, in either direction — used to filter lists the
// database policies don't cover on their own.
export async function blockedIds(): Promise<Set<string>> {
  const uid = myId();
  if (!supabase || !uid) return new Set();
  const { data } = await supabase
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
  const out = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    out.add(r.blocker_id === uid ? r.blocked_id : r.blocker_id);
  }
  return out;
}
