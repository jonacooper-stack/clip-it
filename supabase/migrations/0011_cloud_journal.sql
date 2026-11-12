-- 0011: the cloud journal, scores kept by the server, and a blocked-language
-- check in the database.
--
-- Until now a player's journal lived only on their phone and the app reported
-- its own score. After this migration (and the matching server and app
-- update):
--   * each account's sightings are stored here, readable only by that account,
--     written only by the server;
--   * the leaderboard score is worked out by the server from those sightings;
--   * a wall post takes its points and species from the sighting it shares;
--   * comments, captions and display names are checked for blocked language
--     here, not only in the app.
--
-- Run in the Supabase SQL editor. Safe to run more than once, and safe to run
-- before the server or the app is updated: apps that haven't updated yet keep
-- working as they do today for 30 days (see "legacy window" below).

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- 1. settings the server and these rules read ----------
-- RLS on, no policies: only the service role (and this file) can read or write.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- The legacy window. Apps that haven't updated yet still score sightings on
-- the phone and report their own totals. That is accepted until this moment,
-- and so is the one-time upload of each player's existing on-device journal.
-- Afterwards only server-scored sightings count. To close it early or extend
-- it:  update public.app_settings set value = to_jsonb(now() + interval '14 days')
--        where key = 'legacy_import_until';
insert into public.app_settings (key, value)
values ('legacy_import_until', to_jsonb(now() + interval '30 days'))
on conflict (key) do nothing;

create or replace function private.legacy_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select now() < (value #>> '{}')::timestamptz from public.app_settings where key = 'legacy_import_until'),
    false);
$$;
revoke all on function private.legacy_open() from public;
grant execute on function private.legacy_open() to authenticated, service_role;

-- ---------- 2. the journal ----------
-- One row per sighting that counts (a wild animal the identifier named). The
-- id is the one the app gave the sighting, so a retry can never create a
-- second row. Photos that didn't count (pets, people, nothing found) are not
-- stored here at all.
create table if not exists public.journal_sightings (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{6,64}$'),
  observed_at timestamptz not null,           -- when the photo was taken
  logged_at timestamptz not null,             -- when it was logged in the app
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set when the player deletes the sighting. The row stays so the player's
  -- other devices learn it is gone instead of uploading it again. Everything
  -- personal is emptied; the species and the photo's fingerprints are kept, so
  -- deleting and re-adding can't make the same photo or species score afresh.
  deleted_at timestamptz,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_m real,
  status text check (status in ('ai_confident', 'needs_review', 'disputed', 'human_confirmed')),
  common_name text check (char_length(common_name) <= 80),
  scientific_name text check (char_length(scientific_name) <= 80),
  taxon_group text check (char_length(taxon_group) <= 20),
  confidence real,
  scene_tags text[] not null default '{}',
  caption text check (char_length(caption) <= 240),
  dangerous boolean not null default false,
  points integer not null default 0 check (points between 0 and 500),
  -- For a sighting scored on the phone: what the phone said it was worth,
  -- kept even when it counts for nothing (after the legacy window), so the
  -- cut-off can be revisited.
  claimed_points integer check (claimed_points between 0 and 500),
  score jsonb,                                -- how the points were worked out
  -- true: the server identified the photo and scored it itself.
  -- false: scored on the phone before this change and uploaded once (legacy window).
  verified boolean not null default false,
  capture text check (capture in ('camera', 'library')),
  flags jsonb,                                -- notes for review (e.g. the identifier had doubts about the picture)
  photo_sha text,                             -- fingerprints of the photo, to spot the same picture
  photo_phash text,                           -- handed in twice (api/_lib/phash.ts)
  has_photo boolean not null default false,   -- a copy is stored at journal-photos/<user_id>/<id>.jpg
  science jsonb,                              -- the player's field-note answers
  proposed_species text check (char_length(proposed_species) <= 80),
  wall_post_id uuid,
  model text,                                 -- which model identified it
  primary key (user_id, id)
);
create index if not exists journal_sightings_user_time_idx on public.journal_sightings (user_id, observed_at desc);
create index if not exists journal_sightings_species_idx on public.journal_sightings (scientific_name, recorded_at desc);
create index if not exists journal_sightings_sha_idx on public.journal_sightings (photo_sha) where photo_sha is not null;

-- A player can read their own journal and nothing else. Nobody but the
-- server writes: there are no insert, update or delete rules, and the table
-- privileges for them are removed as well.
alter table public.journal_sightings enable row level security;
drop policy if exists journal_sightings_read_own on public.journal_sightings;
create policy journal_sightings_read_own on public.journal_sightings
  for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.journal_sightings from anon, authenticated;

-- Where each account stands: its time zone (weekly quests run in the player's
-- own zone) and the switch to server-kept scores. ready_at is set at the
-- account's first sync from an updated app: from then on the server owns its
-- score. baseline_points is what the leaderboard showed at that moment, and
-- carryover_points is how much of that the uploaded journal doesn't account
-- for yet. It is added to the score so nobody's score drops at the switch,
-- and it only ever shrinks, as the old journal arrives.
create table if not exists public.journal_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tz text check (char_length(tz) <= 64),
  ready_at timestamptz,
  baseline_points integer not null default 0 check (baseline_points between 0 and 100000),
  carryover_points integer not null default 0 check (carryover_points between 0 and 100000),
  legacy_points integer not null default 0,   -- points accepted from phone-scored sightings so far
  updated_at timestamptz not null default now()
);
alter table public.journal_state enable row level security;
drop policy if exists journal_state_read_own on public.journal_state;
create policy journal_state_read_own on public.journal_state
  for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.journal_state from anon, authenticated;

-- ---------- 3. the score on the leaderboard is the server's ----------
-- profiles.points and species_count used to be whatever the app reported.
-- Now the server writes them. An app's own numbers are still accepted only
-- during the legacy window, and only for an account that hasn't synced from
-- an updated app yet. Otherwise they are ignored: the row keeps the values
-- it had.
create or replace function public.protect_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
begin
  if claims_role not in ('anon', 'authenticated') then
    return new;                                -- the server
  end if;
  if private.legacy_open()
     and not exists (select 1 from public.journal_state s where s.user_id = new.id and s.ready_at is not null) then
    return new;                                -- an app that hasn't updated yet
  end if;
  if tg_op = 'INSERT' then
    new.points := 0;
    new.species_count := 0;
  else
    new.points := old.points;
    new.species_count := old.species_count;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_score on public.profiles;
create trigger profiles_protect_score
  before insert or update on public.profiles
  for each row execute function public.protect_score();

-- ---------- 4. a wall post takes its facts from the sighting it shares ----------
alter table public.feed_posts add column if not exists sighting_id text;
alter table public.feed_posts drop constraint if exists feed_posts_sighting_id_shape;
alter table public.feed_posts add constraint feed_posts_sighting_id_shape
  check (sighting_id is null or sighting_id ~ '^[A-Za-z0-9_-]{6,64}$') not valid;
-- One post per sighting (a second device can't share it again).
create unique index if not exists feed_posts_one_per_sighting
  on public.feed_posts (user_id, sighting_id) where sighting_id is not null;

-- With a sighting_id that is in the poster's own journal, the points and the
-- species come from the journal, whatever the app sent. Without one (an app
-- that hasn't updated), the app's values are kept during the legacy window
-- and the points are zero after it.
create or replace function public.feed_post_from_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  j record;
begin
  if claims_role not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.sighting_id is not null then
    select s.points, s.common_name, s.scientific_name into j
      from public.journal_sightings s
      where s.user_id = new.user_id and s.id = new.sighting_id and s.deleted_at is null;
    if found then
      new.points := j.points;
      new.common_name := j.common_name;
      new.scientific_name := j.scientific_name;
      return new;
    end if;
  end if;
  if not private.legacy_open() then
    new.points := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists feed_posts_from_journal on public.feed_posts;
create trigger feed_posts_from_journal
  before insert on public.feed_posts
  for each row execute function public.feed_post_from_journal();

-- ---------- 5. blocked language, checked here as well as in the app ----------
-- >>> generated by scripts/gen-moderation-sql.ts from shared/moderation.ts: do not edit by hand >>>
-- One word, the way the filter sees it: lower case, look-alike digits and
-- symbols turned back into letters, everything but a–z dropped, and a letter
-- repeated three or more times cut to two ("fuuuuck" -> "fuuck").
create or replace function private.squash_word(w text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(translate(lower(w), '013457@$!', 'oieastasi'), '[^a-z]', '', 'g'),
    '(.)\1{2,}', '\1\1', 'g');
$$;

-- True if the text contains language that isn't allowed on ClipIt. The same
-- rule as hasBlockedLanguage in shared/moderation.ts: any single word on the
-- list (also with doubled letters collapsed), or the whole text spelling a
-- listed word of four or more letters once spaces and punctuation are removed
-- ("f u c k"). Look-alike characters are folded first (normalize NFKC), so
-- this is never more lenient than the app.
create or replace function private.has_blocked_language(t text)
returns boolean
language sql
immutable
as $$
  with input as (
    select normalize(coalesce(t, ''), NFKC) as s
  ), words as (
    select private.squash_word(tok) as n
    from input,
      regexp_split_to_table(
        regexp_replace(input.s, '[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'),
        ' ') as tok
  )
  select exists (
      select 1 from words
      where n <> ''
        and (n = any (array['fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'dickhead', 'cock', 'cunt', 'pussy', 'whore', 'slut', 'twat', 'wanker', 'porn', 'nude', 'nudes', 'rape', 'rapist', 'kys', 'killyourself'])
          or regexp_replace(n, '(.)\1+', '\1', 'g') = any (array['fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'dickhead', 'cock', 'cunt', 'pussy', 'whore', 'slut', 'twat', 'wanker', 'porn', 'nude', 'nudes', 'rape', 'rapist', 'kys', 'killyourself']))
    )
    or private.squash_word((select s from input)) = any (array['fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'dickhead', 'cock', 'cunt', 'pussy', 'whore', 'slut', 'twat', 'wanker', 'porn', 'nude', 'nudes', 'rape', 'rapist', 'killyourself']);
$$;
-- <<< generated <<<

-- Comments and wall posts with blocked language are refused. (Only for what
-- players write: Scout's own comments come from the server, which checks its
-- text before posting.) Name the columns to check as trigger arguments.
create or replace function public.reject_blocked_language()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  i int;
  v text;
begin
  if claims_role not in ('anon', 'authenticated') then
    return new;
  end if;
  for i in 0 .. tg_nargs - 1 loop
    v := to_jsonb(new) ->> tg_argv[i];
    if v is not null
       and (tg_op = 'INSERT' or v is distinct from (to_jsonb(old) ->> tg_argv[i]))
       and private.has_blocked_language(v) then
      raise exception 'That language isn''t allowed on ClipIt.' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists post_comments_language on public.post_comments;
create trigger post_comments_language
  before insert or update on public.post_comments
  for each row execute function public.reject_blocked_language('body');

-- (Runs after feed_posts_from_journal: triggers fire in name order.)
drop trigger if exists feed_posts_language on public.feed_posts;
create trigger feed_posts_language
  before insert or update on public.feed_posts
  for each row execute function public.reject_blocked_language('caption', 'common_name', 'scientific_name');

-- A display name with blocked language is replaced rather than refused: the
-- name often arrives from Google or Apple inside a larger update (creating
-- the profile row everything else hangs off), and refusing that would lock
-- the player out of posting altogether.
create or replace function public.clean_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
begin
  if claims_role in ('anon', 'authenticated')
     and new.display_name is not null
     and (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and private.has_blocked_language(new.display_name) then
    new.display_name := case when tg_op = 'INSERT' then 'Explorer' else coalesce(old.display_name, 'Explorer') end;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clean_display_name on public.profiles;
create trigger profiles_clean_display_name
  before insert or update on public.profiles
  for each row execute function public.clean_display_name();

-- ---------- 6. private storage for journal photos ----------
-- Not public: a photo here can only be opened by its owner (through a
-- short-lived signed link). The server stores the copies; a player may read
-- and delete their own, nothing else.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists journal_photos_read_own on storage.objects;
create policy journal_photos_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists journal_photos_delete_own on storage.objects;
create policy journal_photos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
