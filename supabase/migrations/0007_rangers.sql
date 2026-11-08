-- ClipIt — "ClipIt Rangers": clearly labeled bot accounts run by the ClipIt
-- team. They post real (licensed) wildlife photos and pace the leaderboard so
-- early players always have someone to chase. The app shows a "Ranger" badge
-- on every bot name, and players can hide Rangers in Profile.
--
-- Run in the Supabase SQL editor (like the earlier migrations). Idempotent and
-- safe to re-run; the "destructive operations" warning is just the
-- drop/create-or-replace lines. The Rangers themselves are created by the
-- /api/rangers job on Vercel (it needs SUPABASE_SERVICE_ROLE_KEY there).

-- ---------- bot flag ----------
alter table public.profiles add column if not exists is_bot boolean not null default false;
create index if not exists profiles_is_bot_idx on public.profiles (is_bot) where is_bot;

-- Players can upsert their own profile row, so make sure nobody can flag (or
-- un-flag) themselves as a bot from the app. Only the service role (the
-- Rangers job) or the SQL editor can change is_bot.
create or replace function public.protect_is_bot()
returns trigger
language plpgsql
as $$
declare
  claims_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
begin
  if claims_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_bot := false;
    else
      new.is_bot := old.is_bot;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_is_bot on public.profiles;
create trigger profiles_protect_is_bot
  before insert or update on public.profiles
  for each row execute function public.protect_is_bot();

-- ---------- photo credit on posts ----------
-- Rangers post Creative Commons / public-domain photos, which must credit the
-- photographer. The app shows this line under the photo when it's set.
alter table public.feed_posts add column if not exists photo_credit text;

-- Bots never accept friend requests, so stop players sending them.
drop policy if exists friendships_request on public.friendships;
create policy friendships_request on public.friendships
  for insert with check (
    requester_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = addressee_id and p.is_bot)
  );
