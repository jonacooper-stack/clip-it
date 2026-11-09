-- 0008: private profile settings, for Scout's "explorers you might like".
--
-- public.profiles is readable by every signed-in player (leaderboard, search),
-- so the home region moves to a table only its owner and the server can read.
-- `discoverable` lets a player opt out of being suggested to others (the app
-- turns it off by default for ages 13–17).
-- Run in the Supabase SQL editor. Safe to run more than once.

create table if not exists public.profile_private (
  id uuid primary key references auth.users (id) on delete cascade,
  home_region text,
  discoverable boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;
drop policy if exists profile_private_read_own on public.profile_private;
create policy profile_private_read_own on public.profile_private
  for select using (id = auth.uid());
drop policy if exists profile_private_insert_own on public.profile_private;
create policy profile_private_insert_own on public.profile_private
  for insert with check (id = auth.uid());
drop policy if exists profile_private_update_own on public.profile_private;
create policy profile_private_update_own on public.profile_private
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Move regions saved so far, then stop keeping them where everyone can read.
insert into public.profile_private (id, home_region)
  select p.id, p.home_region
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.home_region is not null
on conflict (id) do update set home_region = excluded.home_region, updated_at = now();
update public.profiles set home_region = null where home_region is not null;
