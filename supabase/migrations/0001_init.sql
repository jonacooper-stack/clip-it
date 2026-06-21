-- Clip-It — initial schema
--
-- Design goals (see docs/ARCHITECTURE.md):
--   * Science-ready from day one, even though science export ships last.
--   * Location privacy is structural: every sighting stores a PRECISE location
--     (owner-only) and a FUZZED public location; sensitive/endangered species
--     are fuzzed harder or suppressed.
--   * Scoring is an append-only ledger so disputes re-score cleanly and stay auditable.
--   * Points are derived from a per-species rarity score (no hand-tuned values),
--     with a forward-compatible hook for region-aware rarity.
--   * Kids play under a parent-managed profile (guardian link + privacy flags).
--
-- This is the MVP schema. Tables/columns marked "(forward-compatible)" are stubbed
-- now so later phases (map, freemium, science export) don't need a migration.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type sensitivity_level as enum ('none', 'sensitive', 'endangered');

create type id_status as enum (
  'ai_pending',      -- queued / in flight
  'ai_confident',    -- AI auto-resolved with high confidence
  'needs_review',    -- low confidence / rare / dangerous / high-drama
  'human_confirmed', -- a reviewer confirmed the species
  'disputed',        -- player disagreed and proposed their own species
  'rejected'         -- not a valid wildlife sighting
);

create type verification_status as enum ('unverified', 'verified');

create type sighting_visibility as enum ('private', 'shared'); -- 'shared' unused until Phase 2

create type capture_method as enum ('in_app_camera', 'imported'); -- 'imported' deferred to Phase 4

create type review_reason as enum (
  'low_confidence', 'rare', 'dangerous', 'high_drama', 'user_reported'
);

create type review_status as enum ('open', 'in_progress', 'resolved');

create type scoring_status as enum ('provisional', 'final', 'revoked');

-- ---------------------------------------------------------------------------
-- Profiles (extends Supabase auth.users) + parent/guardian relationship
-- ---------------------------------------------------------------------------

create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  -- Store an age BRACKET, not a full DOB, to minimize PII.
  age_bracket     text,                 -- e.g. 'under_13', '13_17', 'adult'
  is_minor        boolean not null default false,
  -- Kids play under a guardian's account. Null for adults / standalone accounts.
  guardian_id     uuid references profiles (id) on delete set null,
  is_child_profile boolean not null default false,
  -- COPPA / consent tracking (forward-compatible; populated by the Phase 1.5 flow).
  consent_status  text not null default 'n/a',  -- 'n/a' | 'pending' | 'granted'
  consent_granted_at timestamptz,
  -- Privacy flags. Children default to the most protective settings.
  share_precise_location boolean not null default false,
  science_opt_in  boolean not null default false,
  home_region     text,                 -- coarse region code (optional)
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz           -- soft-delete for account-deletion compliance
);

comment on column profiles.guardian_id is
  'Parent/guardian profile for a child account. Guardians can view their children''s data.';

-- ---------------------------------------------------------------------------
-- Species catalog (the "breadth" problem — seeded from public datasets, not hand-authored)
-- ---------------------------------------------------------------------------

create table species (
  id                 uuid primary key default gen_random_uuid(),
  scientific_name    text not null unique,           -- canonical key
  common_name        text,
  taxon_rank         text,                            -- 'species', 'subspecies', ...
  taxonomy           jsonb not null default '{}'::jsonb,   -- kingdom..species
  taxon_external_ids jsonb not null default '{}'::jsonb,   -- { "inat": ..., "gbif": ... } for science interop
  -- Rarity in [0,1]: 0 = extremely common, 1 = extremely rare. Drives base points.
  rarity_score       numeric not null default 0.1 check (rarity_score >= 0 and rarity_score <= 1),
  rarity_source      text,                            -- 'observation_frequency' | 'iucn' | 'blended'
  conservation_status text,                           -- IUCN code (LC, NT, VU, EN, CR, ...)
  sensitivity_level  sensitivity_level not null default 'none',  -- drives location fuzzing / map suppression
  is_dangerous       boolean not null default false,
  danger_notes       text,
  -- Cached base points derived from rarity_score (kept in sync by the scoring service).
  base_points        integer,
  status             text not null default 'active',  -- 'active' | 'pending' (unmatched AI name awaiting review)
  created_at         timestamptz not null default now()
);

create index species_sensitivity_idx on species (sensitivity_level);

-- Region-aware rarity (forward-compatible hook). MVP uses species.rarity_score nationally;
-- when this is populated, scoring prefers the region-specific score for the observer's region.
create table species_region_rarity (
  species_id   uuid not null references species (id) on delete cascade,
  region_code  text not null,            -- e.g. US state / ecoregion code
  rarity_score numeric not null check (rarity_score >= 0 and rarity_score <= 1),
  observation_count integer,
  primary key (species_id, region_code)
);

-- ---------------------------------------------------------------------------
-- Behavior / scene vocabulary (controlled list → data-driven multipliers)
-- ---------------------------------------------------------------------------

create table scene_tags (
  code            text primary key,        -- 'with_young', 'predation', 'in_flight', ...
  display_name    text not null,
  multiplier      numeric not null default 1.0,
  requires_review boolean not null default false,  -- high-drama tags get a human glance
  category        text
);

insert into scene_tags (code, display_name, multiplier, requires_review, category) values
  ('with_young',  'With young / babies',  3.0, false, 'family'),
  ('predation',   'Predation / hunting',  3.0, true,  'behavior'),
  ('in_flight',   'In flight',            1.5, false, 'behavior'),
  ('courtship',   'Courtship / display',  2.0, false, 'behavior'),
  ('group_herd',  'Group / herd',         1.5, false, 'social');

-- ---------------------------------------------------------------------------
-- Sightings (the core science object)
-- ---------------------------------------------------------------------------

create table sightings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles (id) on delete cascade,
  observed_at         timestamptz not null,          -- capture time (distinct from upload time)
  created_at          timestamptz not null default now(),

  -- Location: precise (owner-only via RLS) + fuzzed public version.
  geom                geometry(Point, 4326) not null,            -- PRECISE — never exposed publicly
  geom_public         geometry(Point, 4326),                     -- fuzzed/generalized; null for sensitive species
  location_accuracy_m numeric,
  geo_source          text not null default 'device_gps',

  capture_method      capture_method not null default 'in_app_camera',

  -- Media
  media_path          text,                          -- Supabase Storage path
  media_hash          text,                          -- for future re-photo / dedup checks
  media_width         integer,
  media_height        integer,
  exif_stripped       boolean not null default true,

  -- Identification
  species_id          uuid references species (id) on delete set null,
  id_status           id_status not null default 'ai_pending',
  ai_result           jsonb,                         -- { candidates[], confidence, scene_tags[], caption, flags[] }
  ai_model_version    text,                          -- provenance for reproducibility / science
  -- Player's dispute guess (self-ID lives here, on the correction path).
  proposed_species_id   uuid references species (id) on delete set null,
  proposed_species_text text,                        -- free text if not matched to the catalog

  -- Forward-compatible flags (no migration needed for later phases)
  verification_status verification_status not null default 'unverified',  -- powers Phase 4 free/paid split
  visibility          sighting_visibility not null default 'private',      -- 'shared' arrives in Phase 2
  is_quality_flagged  boolean not null default false
);

create index sightings_user_idx on sightings (user_id);
create index sightings_species_idx on sightings (species_id);
create index sightings_geom_gix on sightings using gist (geom);
create index sightings_geom_public_gix on sightings using gist (geom_public);

comment on column sightings.geom is 'PRECISE location. Owner-only (RLS). Never exposed on any shared/public surface.';
comment on column sightings.geom_public is 'Fuzzed/generalized location for shared views. NULL for sensitive/endangered species.';

-- ---------------------------------------------------------------------------
-- Scoring ledger (append-only — never mutate a sighting's points in place)
-- ---------------------------------------------------------------------------

create table scoring_events (
  id                 uuid primary key default gen_random_uuid(),
  sighting_id        uuid not null references sightings (id) on delete cascade,
  user_id            uuid not null references profiles (id) on delete cascade,
  awarded_at         timestamptz not null default now(),
  base_points        integer not null,
  rarity_component   numeric,
  behavior_multiplier numeric not null default 1.0,
  bonuses            jsonb not null default '{}'::jsonb,   -- { first_of_species, quest_id, streak }
  total_points       integer not null,
  rule_version       text not null,                        -- so historical awards stay explainable
  status             scoring_status not null default 'provisional'
);

create index scoring_events_sighting_idx on scoring_events (sighting_id);
create index scoring_events_user_idx on scoring_events (user_id);

-- ---------------------------------------------------------------------------
-- Quests & streaks
-- ---------------------------------------------------------------------------

create table quests (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  criteria     jsonb not null,          -- { distinct_species: 3, taxon: 'Aves', window: '7d' }
  reward_points integer not null default 0,
  active_from  timestamptz,
  active_to    timestamptz,
  is_active    boolean not null default true
);

create table user_quests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  quest_id     uuid not null references quests (id) on delete cascade,
  progress     jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  unique (user_id, quest_id)
);

create table user_streaks (
  user_id        uuid primary key references profiles (id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date
);

-- ---------------------------------------------------------------------------
-- Human review queue (the hybrid "humans adjudicate" path + data flywheel)
-- ---------------------------------------------------------------------------

create table review_queue (
  id           uuid primary key default gen_random_uuid(),
  sighting_id  uuid not null references sightings (id) on delete cascade,
  reason       review_reason not null,
  priority     integer not null default 0,
  status       review_status not null default 'open',
  reviewer_id  uuid references profiles (id) on delete set null,
  decision     jsonb,                   -- { species_id, scene_tags[], notes }
  notes        text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index review_queue_status_idx on review_queue (status, priority desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security (starting policies — tighten as features land)
-- ---------------------------------------------------------------------------
-- Reference data (species, scene_tags, quests) is world-readable.
-- User data is owner-only, with guardians able to read their children's rows.

alter table profiles       enable row level security;
alter table sightings      enable row level security;
alter table scoring_events enable row level security;
alter table user_quests    enable row level security;
alter table user_streaks   enable row level security;
alter table review_queue   enable row level security;

-- Profiles: you can see/manage yourself; a guardian can see their children.
create policy profiles_self_select on profiles
  for select using (id = auth.uid() or guardian_id = auth.uid());
create policy profiles_self_update on profiles
  for update using (id = auth.uid() or guardian_id = auth.uid());
create policy profiles_self_insert on profiles
  for insert with check (id = auth.uid() or guardian_id = auth.uid());

-- Sightings: owner (or the owner's guardian) only. Precise geom never leaves this boundary.
create policy sightings_owner_select on sightings
  for select using (
    user_id = auth.uid()
    or user_id in (select id from profiles where guardian_id = auth.uid())
  );
create policy sightings_owner_insert on sightings
  for insert with check (
    user_id = auth.uid()
    or user_id in (select id from profiles where guardian_id = auth.uid())
  );
create policy sightings_owner_update on sightings
  for update using (
    user_id = auth.uid()
    or user_id in (select id from profiles where guardian_id = auth.uid())
  );

-- Scoring events: read-only to the owner (writes happen server-side via the Edge Function).
create policy scoring_events_owner_select on scoring_events
  for select using (
    user_id = auth.uid()
    or user_id in (select id from profiles where guardian_id = auth.uid())
  );

-- Quest progress & streaks: owner/guardian.
create policy user_quests_owner_all on user_quests
  for all using (
    user_id = auth.uid()
    or user_id in (select id from profiles where guardian_id = auth.uid())
  );
create policy user_streaks_owner_all on user_streaks
  for all using (
    user_id = auth.uid()
    or user_id in (select id from profiles where guardian_id = auth.uid())
  );

-- Note: scoring writes, AI calls, and review-queue management run server-side through
-- the service role (which bypasses RLS), so points can't be forged from the client.
