-- 0009: Scout's stories + "Wrong photo?" reports.
-- Run in the Supabase SQL editor. Safe to run more than once.

-- Photos players reported as wrong. Any open report hides the photo
-- everywhere in Scout's posts (and it's never picked again). To review:
--   select url, species, context, reason, created_at from crew_photo_flags order by created_at desc;
-- To restore a photo that was fine: update crew_photo_flags set cleared = true where url = '…';
-- To remove a photo yourself: insert into crew_photo_flags (photo_key, url, reason) values ('<key>', '<url>', 'admin');
--   (photo_key is the Commons file path, e.g. 'commons:a/ab/File_name.jpg', or the full URL for library photos)
create table if not exists public.crew_photo_flags (
  id bigint generated always as identity primary key,
  photo_key text not null,
  url text not null,
  species text,
  context text,                     -- where it was shown, e.g. the post title
  reason text,
  reporter_id uuid references auth.users (id) on delete set null,
  cleared boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists crew_photo_flags_key_idx on public.crew_photo_flags (photo_key) where not cleared;
create unique index if not exists crew_photo_flags_once on public.crew_photo_flags (photo_key, reporter_id);
alter table public.crew_photo_flags enable row level security;   -- server only (no policies)

-- Scout's stories (the "Read the story" pages), cached so each is written once.
create table if not exists public.crew_stories (
  key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.crew_stories enable row level security;        -- server only (no policies)
