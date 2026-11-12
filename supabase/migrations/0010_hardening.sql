-- 0010: hardening. Limits on what an app can write to the shared tables, the
-- counters the server's daily limits count in, and tighter social rules.
--
-- The app's publishable key ships inside the app, so anyone can talk to these
-- tables directly; the rules here are what hold when they do. Nothing in this
-- file changes how the app behaves for a player using it normally.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Constraints are
-- added NOT VALID: rows already in the tables are left alone, and every new
-- or changed row is checked.

-- ---------- 1. daily usage counters (server only) ----------
-- The server counts each player's AI-backed requests per day here
-- (api/_lib/server.ts → dailyLimitReached). RLS on, no policies: only the
-- service role can read or write.
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null,                 -- 'identify' | 'generate' | 'flag'
  count integer not null default 0,
  primary key (user_id, day, kind)
);
alter table public.usage_counters enable row level security;

-- Add one to today's count and return the new total (one atomic statement, so
-- simultaneous requests can't both slip under a limit).
create or replace function public.bump_usage(p_user uuid, p_kind text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.usage_counters (user_id, day, kind, count)
  values (p_user, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = public.usage_counters.count + 1
  returning count;
$$;
revoke all on function public.bump_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, text) to service_role;

-- ---------- 2. size and shape limits on player-written fields ----------
-- Display names. (The app allows 30 characters; names from Google or Apple
-- can run longer.)
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 60) not valid;

-- Scores can't be negative or absurd. (They are still reported by the app:
-- see docs/DECISIONS.md, "server-side scoring".)
alter table public.profiles drop constraint if exists profiles_score_range;
alter table public.profiles add constraint profiles_score_range
  check (points between 0 and 5000000 and species_count between 0 and 100000) not valid;

-- A profile picture must be a file in the player's own avatars folder (Scout's
-- is set by the server). Stops a profile pointing at another server's image.
alter table public.profiles drop constraint if exists profiles_avatar_own;
alter table public.profiles add constraint profiles_avatar_own
  check (
    avatar_url is null
    or is_bot
    or avatar_url like 'https://%/storage/v1/object/public/avatars/' || id::text || '/%'
  ) not valid;

-- Wall posts: short text, a single sighting's worth of points, and a photo
-- that is a file in the poster's own feed-photos folder.
alter table public.feed_posts drop constraint if exists feed_posts_text_len;
alter table public.feed_posts add constraint feed_posts_text_len
  check (
    (common_name is null or char_length(common_name) <= 80)
    and (scientific_name is null or char_length(scientific_name) <= 80)
    and (caption is null or char_length(caption) <= 500)
  ) not valid;
alter table public.feed_posts drop constraint if exists feed_posts_points_range;
alter table public.feed_posts add constraint feed_posts_points_range
  check (points between 0 and 500) not valid;
alter table public.feed_posts drop constraint if exists feed_posts_photo_own;
alter table public.feed_posts add constraint feed_posts_photo_own
  check (
    photo_url is null
    or photo_url like 'https://%/storage/v1/object/public/feed-photos/' || user_id::text || '/%'
  ) not valid;

alter table public.post_comments drop constraint if exists post_comments_body_len;
alter table public.post_comments add constraint post_comments_body_len
  check (char_length(body) between 1 and 1000) not valid;

alter table public.content_reports drop constraint if exists content_reports_text_len;
alter table public.content_reports add constraint content_reports_text_len
  check (char_length(reason) <= 100 and (details is null or char_length(details) <= 1000)) not valid;

-- ---------- 3. names players can't take ----------
-- The app already refuses these; this refuses them for anyone writing to the
-- table directly. (The list mirrors CREW_RESERVED_NAMES in shared/crew.ts.)
create or replace function public.protect_display_name()
returns trigger
language plpgsql
as $$
declare
  claims_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  n text := lower(regexp_replace(btrim(coalesce(new.display_name, '')), '\s+', ' ', 'g'));
begin
  if claims_role in ('anon', 'authenticated')
     and (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and (n in ('scout', 'dr. hoot', 'dr hoot', 'moss', 'magpie', 'kestrel', 'field crew')
          or n like '%clipit%' or n like '%clip it%' or n like '%field crew%') then
    raise exception 'That name is reserved. Please choose a different display name.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_display_name on public.profiles;
create trigger profiles_protect_display_name
  before insert or update on public.profiles
  for each row execute function public.protect_display_name();

-- ---------- 4. friend requests: only the person asked can accept ----------
-- The old rule let either side update the row, so the sender could accept
-- their own request. Now only the addressee can, the only possible change is
-- to "accepted", and no other column can be edited.
drop policy if exists friendships_respond on public.friendships;
create policy friendships_respond on public.friendships
  for update using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid() and status = 'accepted');
revoke update on public.friendships from anon, authenticated;
grant update (status) on public.friendships to authenticated;

-- ---------- 5. blocking holds on the server too ----------
-- The app hides a blocked person from the blocker. These rules also stop the
-- blocked person from commenting on, liking, following or friend-requesting
-- the person who blocked them. The check lives in a schema the API doesn't
-- expose, so it can't be called directly to find out who has blocked you.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.blocked_by(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where b.blocker_id = owner and b.blocked_id = auth.uid()
  );
$$;
revoke all on function private.blocked_by(uuid) from public;
grant execute on function private.blocked_by(uuid) to authenticated;

drop policy if exists post_comments_create on public.post_comments;
create policy post_comments_create on public.post_comments
  for insert with check (
    user_id = auth.uid()
    and not private.blocked_by((select p.user_id from public.feed_posts p where p.id = post_id))
  );

drop policy if exists post_likes_create on public.post_likes;
create policy post_likes_create on public.post_likes
  for insert with check (
    user_id = auth.uid()
    and not private.blocked_by((select p.user_id from public.feed_posts p where p.id = post_id))
  );

drop policy if exists follows_create on public.follows;
create policy follows_create on public.follows
  for insert with check (follower_id = auth.uid() and not private.blocked_by(following_id));

drop policy if exists friendships_request on public.friendships;
create policy friendships_request on public.friendships
  for insert with check (
    requester_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from public.profiles p where p.id = addressee_id and p.is_bot)
    and not private.blocked_by(addressee_id)
  );

-- ---------- 6. who follows whom is not public ----------
-- The app only ever reads its own follows; the old rule let any signed-in
-- player read the whole follow graph.
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows
  for select using (follower_id = auth.uid() or following_id = auth.uid());

-- ---------- 7. storage: images only, of a sensible size ----------
-- The app uploads JPEGs well under 1 MB. Without limits, the public buckets
-- would accept any file of any size from any signed-in account.
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id in ('feed-photos', 'avatars');
