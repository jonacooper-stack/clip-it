-- ClipIt — moderation: reporting content and blocking people.
--
-- Required by App Store Review Guideline 1.2 (and Google Play's UGC policy) for
-- any app where users see each other's content: a way to report, a way to block,
-- and a path for us to act on both.
--
-- Run in the Supabase SQL editor like the earlier migrations. Idempotent and safe
-- to re-run; the "destructive operations" warning is just the drop-policy-if-exists
-- lines, which immediately recreate.

-- ---------- content_reports ----------
-- One row per report. Reports are write-only from the client: you can file one and
-- see your own, but nobody can read anyone else's (that would leak who reported
-- whom). Moderation reads them with the service role.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  -- What's being reported. Exactly one target id is set, matching target_type.
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  post_id uuid references public.feed_posts (id) on delete cascade,
  comment_id uuid references public.post_comments (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in (
    'spam', 'harassment', 'nudity', 'violence', 'animal_harm', 'misidentification', 'other'
  )),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Don't let one person file the same report over and over.
  unique (reporter_id, target_type, post_id, comment_id, target_user_id)
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_post_idx on public.content_reports (post_id);

alter table public.content_reports enable row level security;
drop policy if exists content_reports_create on public.content_reports;
create policy content_reports_create on public.content_reports
  for insert with check (reporter_id = auth.uid());
drop policy if exists content_reports_read_own on public.content_reports;
create policy content_reports_read_own on public.content_reports
  for select using (reporter_id = auth.uid());

-- ---------- user_blocks ----------
-- One-way from the blocker's point of view, enforced both ways in the app: a block
-- hides their content from you AND yours from them.
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
-- You can read a block row if you're either side of it: the blocker needs their
-- block list, and the blocked user's client needs to know to hide the blocker.
drop policy if exists user_blocks_read on public.user_blocks;
create policy user_blocks_read on public.user_blocks
  for select using (blocker_id = auth.uid() or blocked_id = auth.uid());
drop policy if exists user_blocks_create on public.user_blocks;
create policy user_blocks_create on public.user_blocks
  for insert with check (blocker_id = auth.uid());
drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks
  for delete using (blocker_id = auth.uid());

-- ---------- enforce blocks in the database, not just the UI ----------
-- Client-side filtering alone is cosmetic: a blocked user could still read the
-- rows directly through the API. These policies replace the blanket
-- "any signed-in user can read" rules from 0002/0004 with ones that exclude
-- either direction of a block.

create or replace function public.is_blocked_pair(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  );
$$;

comment on function public.is_blocked_pair(uuid) is
  'True when the current user and `other` have blocked each other in either direction. security definer so it can see block rows regardless of the caller''s own RLS view.';

-- Profiles are the one exception to a flat block: you can still read the profile
-- of someone YOU blocked, or the "Blocked explorers" screen would list anonymous
-- placeholders and you couldn't tell who you were unblocking. Someone who blocked
-- YOU stays hidden, and their posts and comments are hidden either way by the
-- policies below.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (
    auth.uid() is not null
    and (
      not public.is_blocked_pair(id)
      or exists (
        select 1 from public.user_blocks b
        where b.blocker_id = auth.uid() and b.blocked_id = profiles.id
      )
    )
  );

drop policy if exists feed_read on public.feed_posts;
create policy feed_read on public.feed_posts
  for select using (auth.uid() is not null and not public.is_blocked_pair(user_id));

drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments
  for select using (auth.uid() is not null and not public.is_blocked_pair(user_id));

-- Moderation removals run with the service role, which bypasses RLS — so an
-- actioned report can delete the offending post or comment without giving any
-- client broader delete rights than "your own".
