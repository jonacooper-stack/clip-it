-- ClipIt — social features (leaderboard, friends, wall).
--
-- Self-contained: safe to run on its own in the Supabase SQL editor (it does not
-- depend on 0001_init.sql). Idempotent — safe to re-run.
--
-- Three tables:
--   profiles    — one row per user; holds display name + aggregate points for the
--                 leaderboard. The app upserts the signed-in user's own row.
--   friendships — double opt-in: a row is 'pending' until the addressee accepts.
--   feed_posts  — sightings a user chooses to share to the wall (de-identified:
--                 species + points + caption only, never a location).

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  points integer not null default 0,
  species_count integer not null default 0,
  updated_at timestamptz not null default now()
);
-- tolerate a pre-existing profiles table from 0001 by adding any missing columns
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists points integer not null default 0;
alter table public.profiles add column if not exists species_count integer not null default 0;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (auth.uid() is not null);              -- any signed-in user can read (leaderboard + search)
drop policy if exists profiles_upsert_own on public.profiles;
create policy profiles_upsert_own on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- ---------- friendships ----------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists friendships_requester_idx on public.friendships (requester_id);

alter table public.friendships enable row level security;
drop policy if exists friendships_read_own on public.friendships;
create policy friendships_read_own on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());
drop policy if exists friendships_request on public.friendships;
create policy friendships_request on public.friendships
  for insert with check (requester_id = auth.uid());
drop policy if exists friendships_respond on public.friendships;
create policy friendships_respond on public.friendships
  for update using (requester_id = auth.uid() or addressee_id = auth.uid());
drop policy if exists friendships_remove on public.friendships;
create policy friendships_remove on public.friendships
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------- feed_posts (the wall) ----------
create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  common_name text,
  scientific_name text,
  points integer not null default 0,
  caption text,
  photo_url text,                                          -- reserved for later (photos on the wall)
  created_at timestamptz not null default now()
);
create index if not exists feed_posts_user_idx on public.feed_posts (user_id);
create index if not exists feed_posts_created_idx on public.feed_posts (created_at desc);

alter table public.feed_posts enable row level security;
drop policy if exists feed_read on public.feed_posts;
create policy feed_read on public.feed_posts
  for select using (auth.uid() is not null);              -- signed-in users can read the wall
drop policy if exists feed_post_own on public.feed_posts;
create policy feed_post_own on public.feed_posts
  for insert with check (user_id = auth.uid());
drop policy if exists feed_delete_own on public.feed_posts;
create policy feed_delete_own on public.feed_posts
  for delete using (user_id = auth.uid());
