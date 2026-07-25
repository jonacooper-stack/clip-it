-- ClipIt — social graph + post interactions (follow, like, comment).
--
-- Run in the Supabase SQL editor (like the earlier migrations). Idempotent and
-- safe to re-run; the "destructive operations" warning is just the
-- drop-policy-if-exists lines, which immediately recreate.

-- ---------- follows (one-way) ----------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows
  for select using (auth.uid() is not null);
drop policy if exists follows_create on public.follows;
create policy follows_create on public.follows
  for insert with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete using (follower_id = auth.uid());

-- ---------- post_likes ----------
create table if not exists public.post_likes (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;
drop policy if exists post_likes_read on public.post_likes;
create policy post_likes_read on public.post_likes
  for select using (auth.uid() is not null);
drop policy if exists post_likes_create on public.post_likes;
create policy post_likes_create on public.post_likes
  for insert with check (user_id = auth.uid());
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete using (user_id = auth.uid());

-- ---------- post_comments ----------
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;
drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments
  for select using (auth.uid() is not null);
drop policy if exists post_comments_create on public.post_comments;
create policy post_comments_create on public.post_comments
  for insert with check (user_id = auth.uid());
drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments
  for delete using (user_id = auth.uid());
