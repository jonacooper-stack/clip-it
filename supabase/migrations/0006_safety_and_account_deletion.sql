-- ClipIt — safety (report + block) and in-app account deletion.
--
-- Required for the App Store: Guideline 1.2 (apps with user-generated content
-- must let people report content and block abusive users) and 5.1.1(v) (apps
-- with accounts must let people delete their account from inside the app).
--
-- Run in the Supabase SQL editor (like the earlier migrations). Idempotent and
-- safe to re-run; the "destructive operations" warning is just the
-- drop-policy-if-exists / create-or-replace lines.

-- ---------- user_blocks ----------
-- One row per "I blocked them". The app hides a blocked person's posts,
-- comments and profile from the blocker, and blocking also removes any follow
-- or friendship between the two (done client-side right after the insert).
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
drop policy if exists user_blocks_read_own on public.user_blocks;
create policy user_blocks_read_own on public.user_blocks
  for select using (blocker_id = auth.uid());
drop policy if exists user_blocks_create on public.user_blocks;
create policy user_blocks_create on public.user_blocks
  for insert with check (blocker_id = auth.uid());
drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks
  for delete using (blocker_id = auth.uid());

-- Blocking removes the follow in BOTH directions, but the follows delete policy
-- only lets you remove your own follow. This helper (runs as the table owner)
-- removes the other direction too, scoped strictly to the two people involved.
create or replace function public.sever_ties_with(other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.follows
    where (follower_id = me and following_id = other)
       or (follower_id = other and following_id = me);
  delete from public.friendships
    where (requester_id = me and addressee_id = other)
       or (requester_id = other and addressee_id = me);
end;
$$;
revoke all on function public.sever_ties_with(uuid) from public;
grant execute on function public.sever_ties_with(uuid) to authenticated;

-- ---------- content_reports ----------
-- Users can file reports but never read them back; you review them in the
-- Supabase dashboard (Table editor → content_reports, newest first). Apple
-- expects reports to be acted on within 24 hours.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,              -- the post / comment / profile id
  target_user_id uuid,                  -- the author being reported (kept even if they delete)
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;
drop policy if exists content_reports_create on public.content_reports;
create policy content_reports_create on public.content_reports
  for insert with check (reporter_id = auth.uid());

-- Moderators can delete any post or comment from the dashboard (the service
-- role bypasses RLS), so no extra policy is needed for takedowns.

-- ---------- account deletion ----------
-- Deletes the calling user's auth account. Every app table hangs off
-- profiles → auth.users with ON DELETE CASCADE, so this one delete removes the
-- profile, sightings, posts, likes, comments, follows, friendships and blocks.
-- Reports they FILED are kept (reporter set to null) so moderation history
-- survives. Storage files (photos, avatar) are removed by the app first via the
-- Storage API, since Supabase doesn't allow deleting storage objects from SQL.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
