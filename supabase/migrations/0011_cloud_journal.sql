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
-- the phone and report their own totals. That stays accepted until the time
-- stored under 'legacy_import_until', and so does the one-time upload of
-- each player's existing on-device journal. Afterwards only server-scored
-- sightings count.
--
-- This file does not start the clock: with no date set the window is open,
-- which is exactly how things were before. The clock starts when the updated
-- server first runs its nightly job (it sets the date to 30 days from then),
-- so it can't run out before players have been able to get the update. To set
-- it yourself, or change it later:
--   insert into public.app_settings (key, value)
--   values ('legacy_import_until', to_jsonb(now() + interval '30 days'))
--   on conflict (key) do update set value = excluded.value, updated_at = now();
create or replace function private.legacy_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select now() < (value #>> '{}')::timestamptz from public.app_settings where key = 'legacy_import_until'),
    true);
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
-- privileges for them are removed as well. Reading is limited to the columns
-- the app shows: the server's own notes (review flags, photo fingerprints,
-- which model answered, what a phone claimed) stay on the server.
alter table public.journal_sightings enable row level security;
drop policy if exists journal_sightings_read_own on public.journal_sightings;
create policy journal_sightings_read_own on public.journal_sightings
  for select using (user_id = auth.uid());
revoke all on public.journal_sightings from anon, authenticated;
grant select (
  user_id, id, observed_at, logged_at, recorded_at, updated_at, deleted_at, lat, lng, accuracy_m, status, common_name,
  scientific_name, taxon_group, confidence, scene_tags, caption, dangerous, points, score, verified, capture, has_photo,
  science, proposed_species, wall_post_id
) on public.journal_sightings to authenticated;

-- Where each account stands.
--   tz                the player's time zone (weekly quests run in it)
--   ready_at          set at the account's first sync from an updated app:
--                     from then on the server owns its score
--   baseline_points   what the leaderboard showed for the account when this
--                     migration first ran (capped)
--   carryover_points  how much of that the uploaded journal doesn't account
--                     for yet. It is added to the score so nobody's score
--                     drops at the switch; it only ever shrinks
--   legacy_allowance  the most that sightings scored on the phone (before
--                     scores moved to the server) may add to the score
--   busy_until        a short lock: one journal request at a time per account
-- The baseline and the allowance are set once, below, by this file. They are
-- never taken from an app afterwards, and an account created later has none.
create table if not exists public.journal_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tz text check (char_length(tz) <= 64),
  ready_at timestamptz,
  baseline_points integer not null default 0 check (baseline_points between 0 and 10000),
  carryover_points integer not null default 0 check (carryover_points between 0 and 10000),
  legacy_allowance integer not null default 0 check (legacy_allowance between 0 and 20000),
  busy_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.journal_state enable row level security;
drop policy if exists journal_state_read_own on public.journal_state;
create policy journal_state_read_own on public.journal_state
  for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.journal_state from anon, authenticated;

-- The one-time snapshot, taken the first time this file runs (running it
-- again changes nothing). Every account that exists now gets:
--   a baseline: its current leaderboard score, at most 10,000;
--   an allowance for phone-scored sightings: 500 points for each day the
--   account has existed, at most 20,000.
do $$
begin
  if not exists (select 1 from public.app_settings where key = 'cloud_journal_started') then
    insert into public.journal_state (user_id, baseline_points, carryover_points, legacy_allowance)
    select u.id,
           least(greatest(coalesce(p.points, 0), 0), 10000),
           least(greatest(coalesce(p.points, 0), 0), 10000),
           least(20000, 500 * greatest(1, ceil(extract(epoch from (now() - coalesce(u.created_at, now()))) / 86400.0)::integer))
    from auth.users u
    left join public.profiles p on p.id = u.id
    where not coalesce(p.is_bot, false)
    on conflict (user_id) do nothing;
    insert into public.app_settings (key, value) values ('cloud_journal_started', to_jsonb(now()));
  end if;
end $$;

-- One journal request at a time per account. Recording a sighting reads the
-- journal (is this photo already there? how many of this species?) and then
-- writes to it; two requests doing that together would both be "the first".
-- The lock frees itself after p_seconds if the request that took it dies.
create or replace function public.journal_try_lock(p_user uuid, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  got boolean;
begin
  insert into public.journal_state (user_id, busy_until)
  values (p_user, now() + make_interval(secs => greatest(1, least(p_seconds, 60))))
  on conflict (user_id) do update
    set busy_until = excluded.busy_until
    where public.journal_state.busy_until is null or public.journal_state.busy_until < now()
  returning true into got;
  return coalesce(got, false);
end;
$$;

create or replace function public.journal_unlock(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.journal_state set busy_until = null where user_id = p_user;
$$;
revoke all on function public.journal_try_lock(uuid, integer) from public, anon, authenticated;
revoke all on function public.journal_unlock(uuid) from public, anon, authenticated;
grant execute on function public.journal_try_lock(uuid, integer) to service_role;
grant execute on function public.journal_unlock(uuid) to service_role;

-- ---------- 2b. spotting the same photo handed in twice ----------
-- Fingerprints of the photos on the wall (the only photos of other players
-- anyone can get hold of). Filled by the server: the nightly job fingerprints
-- new posts. RLS on, no policies.
create table if not exists public.wall_prints (
  post_id uuid primary key references public.feed_posts (id) on delete cascade,
  user_id uuid not null,
  photo_sha text,
  photo_phash text,
  created_at timestamptz not null default now()
);
alter table public.wall_prints enable row level security;

-- Wall posts with a photo and no fingerprint yet, newest first (for the nightly job).
create or replace function public.wall_posts_without_prints(p_limit integer)
returns table (id uuid, user_id uuid, photo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.user_id, p.photo_url
  from public.feed_posts p
  left join public.wall_prints w on w.post_id = p.id
  where p.photo_url is not null and w.post_id is null
  order by p.created_at desc
  limit greatest(1, least(p_limit, 500));
$$;
revoke all on function public.wall_posts_without_prints(integer) from public, anon, authenticated;
grant execute on function public.wall_posts_without_prints(integer) to service_role;

-- Accounts that have been deleted and may still have stored journal photos.
-- An app build from before the cloud journal doesn't know to have them
-- removed, so the deletion itself leaves a note here and the nightly job
-- does it. (Fires for delete_my_account() and for a deletion from the
-- dashboard alike, since both remove the profile row.) RLS on, no policies.
create table if not exists public.journal_photo_cleanup (
  user_id uuid primary key,
  queued_at timestamptz not null default now()
);
alter table public.journal_photo_cleanup enable row level security;

create or replace function public.queue_journal_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.journal_photo_cleanup (user_id) values (old.id) on conflict (user_id) do nothing;
  return old;
end;
$$;

drop trigger if exists profiles_queue_photo_cleanup on public.profiles;
create trigger profiles_queue_photo_cleanup
  after delete on public.profiles
  for each row execute function public.queue_journal_photo_cleanup();

-- Photos that were turned down as copies: who, which sighting, and what they
-- matched. Kept so that a wrong call can be looked at and put right.
-- RLS on, no policies.
create table if not exists public.journal_refusals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sighting_id text not null,
  reason text not null,
  matched_user uuid,
  matched_ref text,
  created_at timestamptz not null default now()
);
create index if not exists journal_refusals_user_idx on public.journal_refusals (user_id, created_at desc);
alter table public.journal_refusals enable row level security;

-- Stored pictures that are, or look like, the one being recorded: sightings
-- the server identified itself (any account), wall photos (any account), and
-- the asking account's own sightings of any kind. p_phash / p_mirror are the
-- look-alike fingerprint of the picture and of its mirror image (64 hex
-- characters; see api/_lib/phash.ts); p_bits is how many of the 256 bits may
-- differ. Compared here, over every stored fingerprint, so the answer doesn't
-- depend on what the picture was identified as. A sighting only the phone
-- vouches for is never used against another player.
create or replace function public.journal_look_alikes(p_user uuid, p_sha text, p_phash text, p_mirror text, p_bits integer)
returns table (source text, user_id uuid, ref text, exact boolean, distance integer)
language sql
stable
security definer
set search_path = public
as $$
  with prints as (
    select 'journal'::text as source, s.user_id, s.id as ref, s.photo_sha, s.photo_phash
      from public.journal_sightings s
      where (s.verified or s.user_id = p_user)
        and (s.photo_sha is not null or s.photo_phash is not null)
    union all
    select 'wall', w.user_id, w.post_id::text, w.photo_sha, w.photo_phash
      from public.wall_prints w
  ), compared as (
    select p.source, p.user_id, p.ref,
      (p_sha is not null and p.photo_sha = p_sha) as exact,
      case
        when p_phash ~ '^[0-9a-f]{64}$' and p.photo_phash ~ '^[0-9a-f]{64}$' then
          least(
            bit_count(('x' || p.photo_phash)::bit(256) # ('x' || p_phash)::bit(256)),
            case when p_mirror ~ '^[0-9a-f]{64}$'
              then bit_count(('x' || p.photo_phash)::bit(256) # ('x' || p_mirror)::bit(256))
              else 256 end
          )::integer
        else 256
      end as distance
    from prints p
  )
  select c.source, c.user_id, c.ref, c.exact, c.distance
  from compared c
  where c.exact or c.distance <= p_bits
  order by c.exact desc, c.distance
  limit 50;
$$;
revoke all on function public.journal_look_alikes(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.journal_look_alikes(uuid, text, text, text, integer) to service_role;

-- ---------- 3. the score on the leaderboard is the server's ----------
-- profiles.points and species_count used to be whatever the app reported.
-- Now the server writes them. An app's own numbers are still accepted only
-- during the legacy window, and only for an account that hasn't synced from
-- an updated app yet. Otherwise they are ignored: the row keeps the values
-- it had. (What such an account reports is shown on the board in the
-- meantime but is never carried into the server-kept score: see the
-- snapshot above, and settle_legacy_scores below for when the window ends.)
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

-- Once the legacy window has closed, an account that never switched goes
-- back to what it had when this migration ran: anything its app reported
-- since then was never checked by anyone. Called by the nightly job; does
-- nothing while the window is open. Returns how many scores it changed.
create or replace function public.settle_legacy_scores()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if private.legacy_open() then
    return 0;
  end if;
  update public.profiles p
    set points = least(p.points, coalesce((select s.baseline_points from public.journal_state s where s.user_id = p.id), 0)),
        updated_at = now()
    where not coalesce(p.is_bot, false)
      and not exists (select 1 from public.journal_state s where s.user_id = p.id and s.ready_at is not null)
      and p.points > coalesce((select s.baseline_points from public.journal_state s where s.user_id = p.id), 0);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.settle_legacy_scores() from public, anon, authenticated;
grant execute on function public.settle_legacy_scores() to service_role;

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
    -- (Looked up as the person asking, not as whoever the row names.)
    select s.points, s.common_name, s.scientific_name into j
      from public.journal_sightings s
      where s.user_id = auth.uid() and s.id = new.sighting_id and s.deleted_at is null;
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
      -- (The wording starts the way the app's own message does, which every
      -- app version shows to the player as written.)
      raise exception 'That contains language that isn’t allowed on ClipIt.' using errcode = 'check_violation';
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
-- short-lived signed link). Only the server stores and removes copies (it
-- removes them when a sighting or an account is deleted); a player may read
-- their own and nothing else. JPEGs of the size the app sends.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists journal_photos_read_own on storage.objects;
create policy journal_photos_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists journal_photos_delete_own on storage.objects;
