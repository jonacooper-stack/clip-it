// Social data layer — leaderboard, friends (double opt-in), and the wall.
// Everything is gated on Supabase being configured + a signed-in session; with
// neither, every call no-ops so the local-only app keeps working.

import { supabase } from './supabase';
import { useAuthStore } from '@/state/useAuthStore';
import { resizedBase64 } from './prepareImage';
import { resolvePhoto } from './photoStore';

export type Scope = 'everyone' | 'friends';
// The wall's own scope: everyone, or people I follow (+ accepted friends).
export type FeedScope = 'everyone' | 'following';

// Public Storage bucket that holds wall photos. Create it in Supabase (see
// supabase/migrations/0003_feed_photos.sql); sharing degrades gracefully without it.
const WALL_BUCKET = 'feed-photos';

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  points: number;
  speciesCount: number;
  isMe: boolean;
}

export interface FeedPost {
  id: string;
  userId: string;
  displayName: string;
  commonName: string | null;
  scientificName: string | null;
  points: number;
  caption: string | null;
  photoUrl: string | null;
  createdAt: string;
  isMine: boolean;
  likeCount: number;
  commentCount: number;
  isLiked: boolean; // did I like this post
  isFollowing: boolean; // am I following the author (always false for my own posts)
}

export interface Comment {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

export interface FriendRow {
  id: string; // the friendship row id
  userId: string; // the *other* person's id
  displayName: string;
}

function myId(): string | null {
  return useAuthStore.getState().session?.user?.id ?? null;
}

// Upsert the signed-in user's leaderboard row (display name + aggregate points).
export async function syncMyProfile(displayName: string, points: number, speciesCount: number) {
  const uid = myId();
  if (!supabase || !uid) return;
  await supabase.from('profiles').upsert(
    { id: uid, display_name: displayName, points, species_count: speciesCount, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
}

// Ids of accepted friends (both directions), used to scope the leaderboard/wall.
async function acceptedFriendIds(): Promise<string[]> {
  const uid = myId();
  if (!supabase || !uid) return [];
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  return (data ?? []).map((r: any) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
}

// Ids of people I follow (one-way). Degrades to [] if the follows table isn't set
// up yet (migration 0004), so the wall keeps working.
async function followingIds(): Promise<string[]> {
  const uid = myId();
  if (!supabase || !uid) return [];
  const { data } = await supabase.from('follows').select('following_id').eq('follower_id', uid);
  return (data ?? []).map((r: any) => r.following_id);
}

export async function getLeaderboard(scope: Scope): Promise<LeaderboardEntry[]> {
  const uid = myId();
  if (!supabase || !uid) return [];
  let q = supabase.from('profiles').select('id, display_name, points, species_count').order('points', { ascending: false }).limit(100);
  if (scope === 'friends') {
    const ids = [uid, ...(await acceptedFriendIds())];
    q = q.in('id', ids);
  }
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    displayName: r.display_name || 'Explorer',
    points: r.points ?? 0,
    speciesCount: r.species_count ?? 0,
    isMe: r.id === uid,
  }));
}

const POST_COLUMNS =
  'id, user_id, common_name, scientific_name, points, caption, photo_url, created_at, profiles(display_name)';

// Turn raw feed_posts rows into FeedPosts, batching the like/comment/follow
// lookups into three queries total (not per-post). Everything degrades to
// zero/false if the 0004 tables aren't set up yet, so the images still show.
async function enrichPosts(rows: any[], uid: string): Promise<FeedPost[]> {
  const ids = rows.map((r) => r.id);
  const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  const commentCount = new Map<string, number>();
  const followingSet = new Set<string>();

  if (supabase && ids.length) {
    const [likes, comments, follows] = await Promise.all([
      supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
      supabase.from('post_comments').select('post_id').in('post_id', ids),
      supabase.from('follows').select('following_id').eq('follower_id', uid).in('following_id', authorIds),
    ]);
    for (const l of (likes.data ?? []) as any[]) {
      likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
      if (l.user_id === uid) likedByMe.add(l.post_id);
    }
    for (const c of (comments.data ?? []) as any[]) {
      commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);
    }
    for (const f of (follows.data ?? []) as any[]) followingSet.add(f.following_id);
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.profiles?.display_name || 'Explorer',
    commonName: r.common_name,
    scientificName: r.scientific_name,
    points: r.points ?? 0,
    caption: r.caption,
    photoUrl: r.photo_url ?? null,
    createdAt: r.created_at,
    isMine: r.user_id === uid,
    likeCount: likeCount.get(r.id) ?? 0,
    commentCount: commentCount.get(r.id) ?? 0,
    isLiked: likedByMe.has(r.id),
    isFollowing: r.user_id !== uid && followingSet.has(r.user_id),
  }));
}

export async function getFeed(scope: FeedScope): Promise<FeedPost[]> {
  const uid = myId();
  if (!supabase || !uid) return [];
  let q = supabase.from('feed_posts').select(POST_COLUMNS).order('created_at', { ascending: false }).limit(100);
  if (scope === 'following') {
    // My own posts + people I follow + accepted friends (friends are implicitly
    // followed so existing friendships still surface).
    const ids = Array.from(new Set([uid, ...(await followingIds()), ...(await acceptedFriendIds())]));
    q = q.in('user_id', ids);
  }
  const { data } = await q;
  return enrichPosts((data ?? []) as any[], uid);
}

// A single post with its counts — used by the comments screen.
export async function getPost(postId: string): Promise<FeedPost | null> {
  const uid = myId();
  if (!supabase || !uid) return null;
  const { data } = await supabase.from('feed_posts').select(POST_COLUMNS).eq('id', postId).maybeSingle();
  if (!data) return null;
  const [post] = await enrichPosts([data], uid);
  return post ?? null;
}

// --- follow (one-way) ---

export async function followUser(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('follows').insert({ follower_id: uid, following_id: userId });
  return error ? { error: error.message } : {};
}

export async function unfollowUser(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', userId);
  return error ? { error: error.message } : {};
}

// --- likes ---

export async function likePost(postId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
  return error ? { error: error.message } : {};
}

export async function unlikePost(postId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', uid);
  return error ? { error: error.message } : {};
}

// --- comments ---

export async function getComments(postId: string): Promise<Comment[]> {
  const uid = myId();
  if (!supabase) return [];
  const { data } = await supabase
    .from('post_comments')
    .select('id, user_id, body, created_at, profiles(display_name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.profiles?.display_name || 'Explorer',
    body: r.body,
    createdAt: r.created_at,
    isMine: r.user_id === uid,
  }));
}

export async function addComment(postId: string, body: string): Promise<{ error?: string }> {
  const uid = myId();
  const text = body.trim();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  if (!text) return { error: 'Say something first.' };
  const { error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: uid, body: text });
  return error ? { error: error.message } : {};
}

// Share a sighting to the wall (de-identified — species, points, caption, and an
// optional downscaled photo; never the location).
export async function shareToWall(input: {
  commonName?: string;
  scientificName?: string;
  points?: number;
  caption?: string;
  photoUri?: string;
}): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };

  // Best-effort photo upload to the public wall bucket. Resizing strips EXIF
  // (including any GPS), and if the bucket/policy isn't set up we simply share
  // without a photo rather than failing.
  let photoUrl: string | null = null;
  if (input.photoUri) {
    try {
      const b64 = await resizedBase64(resolvePhoto(input.photoUri) ?? input.photoUri);
      if (b64) {
        const path = `${uid}/${Date.now()}.jpg`;
        // Pass the ArrayBuffer (not the view) — React Native's fetch uploads an
        // ArrayBuffer reliably, whereas a bare Uint8Array can send 0 bytes.
        const { error: upErr } = await supabase.storage
          .from(WALL_BUCKET)
          .upload(path, base64ToBytes(b64).buffer as ArrayBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });
        if (!upErr) {
          photoUrl = supabase.storage.from(WALL_BUCKET).getPublicUrl(path).data.publicUrl;
        }
      }
    } catch {
      // photo is optional — share the post regardless
    }
  }

  const { error } = await supabase.from('feed_posts').insert({
    user_id: uid,
    common_name: input.commonName ?? null,
    scientific_name: input.scientificName ?? null,
    points: input.points ?? 0,
    caption: input.caption ?? null,
    photo_url: photoUrl,
  });
  return error ? { error: error.message } : {};
}

// --- friends (double opt-in) ---

export interface FriendsState {
  friends: FriendRow[]; // accepted
  incoming: FriendRow[]; // requests awaiting my response
  outgoing: FriendRow[]; // requests I sent, awaiting theirs
}

export async function getFriends(): Promise<FriendsState> {
  const uid = myId();
  const empty: FriendsState = { friends: [], incoming: [], outgoing: [] };
  if (!supabase || !uid) return empty;
  const { data } = await supabase
    .from('friendships')
    .select('id, status, requester_id, addressee_id, requester:requester_id(display_name), addressee:addressee_id(display_name)')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  const state: FriendsState = { friends: [], incoming: [], outgoing: [] };
  for (const r of (data ?? []) as any[]) {
    const iAmRequester = r.requester_id === uid;
    const otherId = iAmRequester ? r.addressee_id : r.requester_id;
    const otherName = (iAmRequester ? r.addressee?.display_name : r.requester?.display_name) || 'Explorer';
    const row: FriendRow = { id: r.id, userId: otherId, displayName: otherName };
    if (r.status === 'accepted') state.friends.push(row);
    else if (iAmRequester) state.outgoing.push(row);
    else state.incoming.push(row);
  }
  return state;
}

export async function searchUsers(query: string): Promise<{ id: string; displayName: string }[]> {
  const uid = myId();
  const q = query.trim();
  if (!supabase || !uid || q.length < 2) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', `%${q}%`)
    .neq('id', uid)
    .limit(20);
  return (data ?? []).map((r: any) => ({ id: r.id, displayName: r.display_name || 'Explorer' }));
}

export async function sendFriendRequest(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('friendships').insert({ requester_id: uid, addressee_id: userId, status: 'pending' });
  return error ? { error: error.message } : {};
}

export async function acceptFriendRequest(friendshipId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  return error ? { error: error.message } : {};
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('friendships').delete().eq('id', friendshipId);
}
