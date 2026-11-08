-- ClipIt — the Field Crew: a handful of clearly labeled, playful animal-bots
-- (Dr. Hoot, Scout, Moss, Magpie, Kestrel), each with a job. The app shows a
-- BOT badge on every crew name.
--
-- Run in the Supabase SQL editor (like the earlier migrations). Idempotent and
-- safe to re-run; the "destructive operations" warning is just the
-- drop/create-or-replace lines. The crew accounts themselves are created by
-- the /api/crew-daily job on Vercel (it needs SUPABASE_SERVICE_ROLE_KEY).

-- ---------- crew accounts ----------
alter table public.profiles add column if not exists is_bot boolean not null default false;
alter table public.profiles add column if not exists crew_role text;
create index if not exists profiles_is_bot_idx on public.profiles (is_bot) where is_bot;

-- ---------- home region (chosen by the player; drives Scout's forecasts) ----------
alter table public.profiles add column if not exists home_region text;

-- Players upsert their own profile row, so make sure nobody can flag (or
-- un-flag) themselves as crew from the app. Only the service role (the crew
-- job) or the SQL editor can change is_bot / crew_role.
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
      new.crew_role := null;
    else
      new.is_bot := old.is_bot;
      new.crew_role := old.crew_role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_is_bot on public.profiles;
create trigger profiles_protect_is_bot
  before insert or update on public.profiles
  for each row execute function public.protect_is_bot();

-- The crew never accepts friend requests, so don't let players send them.
drop policy if exists friendships_request on public.friendships;
create policy friendships_request on public.friendships
  for insert with check (
    requester_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = addressee_id and p.is_bot)
  );

-- ---------- caches (server only: RLS on, no policies) ----------
-- Dr. Hoot's facts, one row per species, written once and reused for everyone.
create table if not exists public.crew_facts (
  species_key text primary key,          -- lower-cased scientific (or common) name
  common_name text,
  facts jsonb not null,                  -- { facts: string[], tip: string }
  created_at timestamptz not null default now()
);
alter table public.crew_facts enable row level security;

-- Scout's weekly forecast, one row per region per week.
create table if not exists public.crew_forecasts (
  region text not null,
  week_of date not null,                 -- the Monday the forecast covers
  payload jsonb not null,                -- { headline, items: [...] }
  created_at timestamptz not null default now(),
  primary key (region, week_of)
);
alter table public.crew_forecasts enable row level security;
