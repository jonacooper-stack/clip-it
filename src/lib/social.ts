// Social data layer — leaderboard, friends (double opt-in), and the wall.
// Everything is gated on Supabase being configured + a signed-in session; with
// neither, every call no-ops so the local-only app keeps working.

import { supabase } from './supabase';
import { useAuthStore } from '@/state/useAuthStore';
import { useAppStore } from '@/state/useAppStore';
import { resizedBase64, WALL_PHOTO, AVATAR_PHOTO } from './prepareImage';
import { resolvePhoto } from './photoStore';
import { checkText, reservedName } from './moderation';

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
  avatarUrl: string | null;
  points: number;
  speciesCount: number;
  isMe: boolean;
  isBot: boolean; // a ClipIt Ranger (labeled bot account)
}

export interface FeedPost {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
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
  isBot: boolean; // posted by a ClipIt Ranger (labeled bot account)
  photoCredit: string | null; // attribution for licensed photos (Rangers' posts)
}

export interface Comment {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
  isBot: boolean;
}

export interface FriendRow {
  id: string; // the friendship row id
  userId: string; // the *other* person's id
  displayName: string;
  avatarUrl: string | null;
}

// Turn a raw backend error into something a player can read. Our own
// user-facing messages (moderation, validation) pass through unchanged; the
// technical detail goes to the console.
const FRIENDLY_PREFIXES = ['That contains', 'That name is reserved', 'Names need', 'Say something', 'You can’t', 'Accounts are not', 'You’re not signed'];
export function friendlyError(message: string | undefined, fallback = 'Something went wrong. Please try again in a moment.'): string {
  if (!message) return fallback;
  if (FRIENDLY_PREFIXES.some((p) => message.startsWith(p))) return message;
  console.warn('[social]', message);
  return fallback;
}

function myId(): string | null {
  return useAuthStore.getState().session?.user?.id ?? null;
}

// Most social tables reference profiles(id), and a fresh account has no profile
// row until it first syncs. Create a minimal one (never overwriting) so inserts
// like blocks, reports and posts can't fail on a foreign key.
async function ensureProfile(uid: string) {
  if (!supabase) return;
  await supabase
    .from('profiles')
    .upsert({ id: uid, display_name: useAppStore.getState().displayName }, { onConflict: 'id', ignoreDuplicates: true });
}

// --- blocking (cached so every list can filter cheaply) ---

let blockedCache: { uid: string; ids: Set<string> } | null = null;

// Ids of people I've blocked. Degrades to an empty set if the user_blocks table
// isn't set up yet (migration 0006), so nothing else breaks.
export async function getBlockedIds(): Promise<Set<string>> {
  const uid = myId();
  if (!supabase || !uid) return new Set();
  if (blockedCache?.uid === uid) return blockedCache.ids;
  const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid);
  const ids = new Set<string>(error ? [] : (data ?? []).map((r: any) => r.blocked_id));
  blockedCache = { uid, ids };
  return ids;
}

// Upsert the signed-in user's leaderboard row (display name + aggregate points).
//
// The journal lives on the device, so a fresh install (or a second phone)
// starts at zero locally. Never let that overwrite a higher score already on
// the board: only ever raise the stored totals.
export async function syncMyProfile(displayName: string, points: number, speciesCount: number) {
  const uid = myId();
  if (!supabase || !uid) return;
  const { data: current } = await supabase
    .from('profiles')
    .select('points, species_count')
    .eq('id', uid)
    .maybeSingle();
  const name = checkText(displayName) || reservedName(displayName) ? 'Explorer' : displayName;
  await supabase.from('profiles').upsert(
    {
      id: uid,
      display_name: name,
      points: Math.max(points, (current as any)?.points ?? 0),
      species_count: Math.max(speciesCount, (current as any)?.species_count ?? 0),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
}

// Change my public display name (Profile → Display name). Filtered like
// comments; updates both the account metadata and the leaderboard profile.
export async function updateDisplayName(name: string): Promise<{ error?: string }> {
  const uid = myId();
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  if (clean.length < 2 || clean.length > 30) return { error: 'Names need 2–30 characters.' };
  const blocked = checkText(clean) ?? reservedName(clean);
  if (blocked) return { error: blocked };
  const { error } = await supabase.auth.updateUser({ data: { displayName: clean } });
  if (error) return { error: error.message };
  await supabase.from('profiles').upsert({ id: uid, display_name: clean }, { onConflict: 'id' });
  useAppStore.getState().setDisplayName(clean);
  return {};
}

// --- ClipIt Rangers (labeled bot accounts) ---

// Columns added by migration 0007 (profiles.is_bot, feed_posts.photo_credit).
// Until it has been run, queries that name them fail, so every read that uses
// them retries without, and the app keeps working (no badges).
function missingColumn(error: any): boolean {
  const msg = String(error?.message ?? '');
  return error?.code === '42703' || error?.code === 'PGRST204' || /is_bot|photo_credit/.test(msg);
}

async function selectWithFallback(build: (cols: string) => any, cols: string, fallbackCols: string): Promise<{ data: any[] | null; error: any }> {
  const first = await build(cols);
  if (first.error && missingColumn(first.error)) return build(fallbackCols);
  return first;
}

// Profiles (name, avatar, bot flag) for a set of user ids.
async function profilesFor(ids: string[]): Promise<Map<string, { name: string; avatar: string | null; isBot: boolean }>> {
  const out = new Map<string, { name: string; avatar: string | null; isBot: boolean }>();
  if (!supabase || !ids.length) return out;
  const { data } = await selectWithFallback(
    (cols) => supabase!.from('profiles').select(cols).in('id', ids),
    'id, display_name, avatar_url, is_bot',
    'id, display_name, avatar_url',
  );
  for (const p of (data ?? []) as any[]) {
    out.set(p.id, { name: p.display_name || 'Explorer', avatar: p.avatar_url ?? null, isBot: Boolean(p.is_bot) });
  }
  return out;
}

// Players can hide Rangers (Profile → Show ClipIt Rangers).
function rangersHidden(): boolean {
  return !useAppStore.getState().showRangers;
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
  const friendIds = scope === 'friends' ? [uid, ...(await acceptedFriendIds())] : null;
  const build = (cols: string) => {
    let q = supabase!.from('profiles').select(cols).order('points', { ascending: false }).limit(100);
    if (friendIds) q = q.in('id', friendIds);
    return q;
  };
  const [{ data }, blocked] = await Promise.all([
    selectWithFallback(build, 'id, display_name, avatar_url, points, species_count, is_bot', 'id, display_name, avatar_url, points, species_count'),
    getBlockedIds(),
  ]);
  const hideBots = rangersHidden();
  return (data ?? [])
    .filter((r: any) => !blocked.has(r.id) && !(hideBots && r.is_bot))
    .map((r: any) => ({
      id: r.id,
      displayName: r.display_name || 'Explorer',
      avatarUrl: r.avatar_url ?? null,
      points: r.points ?? 0,
      speciesCount: r.species_count ?? 0,
      isMe: r.id === uid,
      isBot: Boolean(r.is_bot),
    }));
}

// Scalar columns only — display names are fetched separately (see enrichPosts)
// rather than via a `profiles(display_name)` embed, so a flaky PostgREST
// relationship/schema-cache can't blank the whole wall.
const POST_COLUMNS_BASE = 'id, user_id, common_name, scientific_name, points, caption, photo_url, created_at';
const POST_COLUMNS = `${POST_COLUMNS_BASE}, photo_credit`;

// Turn raw feed_posts rows into FeedPosts, batching the author-name, like,
// comment and follow lookups into a handful of queries (not per-post).
// Everything degrades gracefully if the 0004 tables aren't set up yet, so the
// images still show.
async function enrichPosts(rows: any[], uid: string): Promise<FeedPost[]> {
  const ids = rows.map((r) => r.id);
  const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));

  let people = new Map<string, { name: string; avatar: string | null; isBot: boolean }>();
  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  const commentCount = new Map<string, number>();
  const followingSet = new Set<string>();

  if (supabase && ids.length) {
    const [profiles, likes, comments, follows] = await Promise.all([
      profilesFor(authorIds),
      supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
      supabase.from('post_comments').select('post_id').in('post_id', ids),
      supabase.from('follows').select('following_id').eq('follower_id', uid).in('following_id', authorIds),
    ]);
    people = profiles;
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
    displayName: people.get(r.user_id)?.name || 'Explorer',
    avatarUrl: people.get(r.user_id)?.avatar ?? null,
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
    isBot: Boolean(people.get(r.user_id)?.isBot),
    photoCredit: r.photo_credit ?? null,
  }));
}

export interface FeedResult {
  posts: FeedPost[];
  error?: string;
}

export async function getFeed(scope: FeedScope): Promise<FeedResult> {
  const uid = myId();
  if (!supabase) return { posts: [], error: 'The community backend isn’t configured in this build.' };
  if (!uid) return { posts: [], error: 'Sign in to see the wall.' };
  // My own posts + people I follow + accepted friends (friends are implicitly
  // followed so existing friendships still surface).
  const ids = scope === 'following'
    ? Array.from(new Set([uid, ...(await followingIds()), ...(await acceptedFriendIds())]))
    : null;
  const build = (cols: string) => {
    let q = supabase!.from('feed_posts').select(cols).order('created_at', { ascending: false }).limit(100);
    if (ids) q = q.in('user_id', ids);
    return q;
  };
  // Surface the real error instead of swallowing it — otherwise a failed read
  // (RLS, schema, relationship) looks identical to an empty wall.
  const [{ data, error }, blocked] = await Promise.all([selectWithFallback(build, POST_COLUMNS, POST_COLUMNS_BASE), getBlockedIds()]);
  if (error) return { posts: [], error: error.message };
  const visible = ((data ?? []) as any[]).filter((r) => !blocked.has(r.user_id));
  let posts = await enrichPosts(visible, uid);
  if (rangersHidden()) posts = posts.filter((p) => !p.isBot);
  return { posts };
}

// A single post with its counts — used by the comments screen.
export async function getPost(postId: string): Promise<FeedPost | null> {
  const uid = myId();
  if (!supabase || !uid) return null;
  const { data: rows } = await selectWithFallback(
    (cols) => supabase!.from('feed_posts').select(cols).eq('id', postId).limit(1),
    POST_COLUMNS,
    POST_COLUMNS_BASE,
  );
  const data = rows?.[0];
  if (!data) return null;
  if ((await getBlockedIds()).has((data as any).user_id)) return null;
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
    .select('id, user_id, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  const blocked = await getBlockedIds();
  const rows = ((data ?? []) as any[]).filter((r) => !blocked.has(r.user_id));
  // Fetch commenter names/avatars separately (no embed) for the same resilience reason.
  const people = await profilesFor(Array.from(new Set(rows.map((r) => r.user_id))));
  const hideBots = rangersHidden();
  return rows
    .filter((r) => !(hideBots && people.get(r.user_id)?.isBot))
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      displayName: people.get(r.user_id)?.name || 'Explorer',
      avatarUrl: people.get(r.user_id)?.avatar ?? null,
      body: r.body,
      createdAt: r.created_at,
      isMine: r.user_id === uid,
      isBot: Boolean(people.get(r.user_id)?.isBot),
    }));
}

export async function addComment(postId: string, body: string): Promise<{ error?: string }> {
  const uid = myId();
  const text = body.trim();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  if (!text) return { error: 'Say something first.' };
  const blocked = checkText(text);
  if (blocked) return { error: blocked };
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
  if (input.caption) {
    const blocked = checkText(input.caption);
    if (blocked) return { error: blocked };
  }

  // feed_posts.user_id references profiles(id); a fresh account that shared
  // before ever opening the Community tab has no profile row yet, which would
  // fail the insert with a foreign-key violation. Ensure it exists first.
  await ensureProfile(uid);

  // Best-effort photo upload to the public wall bucket. Resizing strips EXIF
  // (including any GPS), and if the bucket/policy isn't set up we simply share
  // without a photo rather than failing.
  let photoUrl: string | null = null;
  if (input.photoUri) {
    try {
      const b64 = await resizedBase64(resolvePhoto(input.photoUri) ?? input.photoUri, WALL_PHOTO);
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

// Unshare: delete one of my own posts. Likes/comments cascade away with it (FK
// on delete cascade); the stored photo is removed best-effort.
export async function deletePost(postId: string, photoUrl?: string | null): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('feed_posts').delete().eq('id', postId).eq('user_id', uid);
  if (error) return { error: error.message };
  if (photoUrl) {
    const marker = `/${WALL_BUCKET}/`;
    const i = photoUrl.indexOf(marker);
    if (i !== -1) {
      try {
        await supabase.storage.from(WALL_BUCKET).remove([photoUrl.slice(i + marker.length)]);
      } catch {
        // orphaned photo is harmless
      }
    }
  }
  return {};
}

// --- profile picture ---

const AVATAR_BUCKET = 'avatars';

// Upload a chosen image as my avatar and save its public URL on my profile.
// Returns the URL so the caller can mirror it locally for instant display.
export async function uploadAvatar(localUri: string): Promise<{ url?: string; error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const b64 = await resizedBase64(resolvePhoto(localUri) ?? localUri, AVATAR_PHOTO);
  if (!b64) return { error: 'Couldn’t read that image.' };
  // A fresh filename each time sidesteps any CDN caching of a replaced avatar.
  const path = `${uid}/avatar_${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, base64ToBytes(b64).buffer as ArrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (upErr) return { error: upErr.message };
  const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: dbErr } = await supabase
    .from('profiles')
    .upsert({ id: uid, display_name: useAppStore.getState().displayName, avatar_url: url }, { onConflict: 'id' });
  if (dbErr) return { error: dbErr.message };
  return { url };
}

// My saved avatar URL (used to restore it on a fresh device / after sign-in).
export async function getMyAvatarUrl(): Promise<string | null> {
  const uid = myId();
  if (!supabase || !uid) return null;
  const { data } = await supabase.from('profiles').select('avatar_url').eq('id', uid).maybeSingle();
  return (data as any)?.avatar_url ?? null;
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
    .select('id, status, requester_id, addressee_id, requester:requester_id(display_name, avatar_url), addressee:addressee_id(display_name, avatar_url)')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  const state: FriendsState = { friends: [], incoming: [], outgoing: [] };
  const blocked = await getBlockedIds();
  for (const r of (data ?? []) as any[]) {
    const iAmRequester = r.requester_id === uid;
    const otherId = iAmRequester ? r.addressee_id : r.requester_id;
    if (blocked.has(otherId)) continue;
    const other = iAmRequester ? r.addressee : r.requester;
    const otherName = other?.display_name || 'Explorer';
    const row: FriendRow = { id: r.id, userId: otherId, displayName: otherName, avatarUrl: other?.avatar_url ?? null };
    if (r.status === 'accepted') state.friends.push(row);
    else if (iAmRequester) state.outgoing.push(row);
    else state.incoming.push(row);
  }
  return state;
}

export async function searchUsers(query: string): Promise<{ id: string; displayName: string; avatarUrl: string | null; isBot: boolean }[]> {
  const uid = myId();
  const q = query.trim();
  if (!supabase || !uid || q.length < 2) return [];
  const { data } = await selectWithFallback(
    (cols) => supabase!.from('profiles').select(cols).ilike('display_name', `%${q}%`).neq('id', uid).limit(20),
    'id, display_name, avatar_url, is_bot',
    'id, display_name, avatar_url',
  );
  const blocked = await getBlockedIds();
  const hideBots = rangersHidden();
  return (data ?? [])
    .filter((r: any) => !blocked.has(r.id) && !(hideBots && r.is_bot))
    .map((r: any) => ({ id: r.id, displayName: r.display_name || 'Explorer', avatarUrl: r.avatar_url ?? null, isBot: Boolean(r.is_bot) }));
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

// --- safety: block + report (App Store Guideline 1.2) ---

export async function blockUser(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  if (userId === uid) return { error: 'You can’t block yourself.' };
  await ensureProfile(uid);
  const { error } = await supabase.from('user_blocks').upsert(
    { blocker_id: uid, blocked_id: userId },
    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
  );
  if (error) return { error: error.message };
  // Remove any follow/friendship in both directions (best-effort).
  try {
    await supabase.rpc('sever_ties_with', { other: userId });
  } catch {
    // the block itself is what matters
  }
  (await getBlockedIds()).add(userId);
  return {};
}

export async function unblockUser(userId: string): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', userId);
  if (error) return { error: error.message };
  (await getBlockedIds()).delete(userId);
  return {};
}

export interface BlockedUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const uid = myId();
  if (!supabase || !uid) return [];
  blockedCache = null; // this screen always reads fresh
  const ids = Array.from(await getBlockedIds());
  if (!ids.length) return [];
  const { data } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids);
  const byId = new Map(((data ?? []) as any[]).map((p) => [p.id, p]));
  return ids.map((id) => ({
    id,
    displayName: byId.get(id)?.display_name || 'Explorer',
    avatarUrl: byId.get(id)?.avatar_url ?? null,
  }));
}

export type ReportTarget = 'post' | 'comment' | 'user';

export const REPORT_REASONS = [
  'Harassment or bullying',
  'Hate or abusive language',
  'Nudity or sexual content',
  'Harm to animals or people',
  'Spam or scam',
  'Shares someone’s location or private info',
  'Something else',
] as const;

export async function reportContent(input: {
  targetType: ReportTarget;
  targetId: string;
  targetUserId: string;
  reason: string;
  details?: string;
}): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'Accounts are not set up yet.' };
  await ensureProfile(uid);
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: uid,
    target_type: input.targetType,
    target_id: input.targetId,
    target_user_id: input.targetUserId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  return error ? { error: error.message } : {};
}

// --- account deletion (App Store Guideline 5.1.1(v)) ---

// Remove every file under "<uid>/" in a bucket. Missing buckets are ignored.
async function emptyMyFolder(bucket: string, uid: string) {
  if (!supabase) return;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
    if (error || !data?.length) return;
    const paths = data.filter((f) => f.name).map((f) => `${uid}/${f.name}`);
    if (!paths.length) return;
    const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
    if (rmErr) return;
  }
}

// Permanently delete the signed-in account: photos + avatar from Storage, then
// the account row (which cascades to every table). The caller signs out and
// clears local data afterwards.
export async function deleteMyAccount(): Promise<{ error?: string }> {
  const uid = myId();
  if (!supabase || !uid) return { error: 'You’re not signed in.' };
  for (const bucket of [WALL_BUCKET, AVATAR_BUCKET, 'sightings']) {
    try {
      await emptyMyFolder(bucket, uid);
    } catch {
      // keep going — the account delete below is the essential part
    }
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { error: error.message };
  blockedCache = null;
  return {};
}
