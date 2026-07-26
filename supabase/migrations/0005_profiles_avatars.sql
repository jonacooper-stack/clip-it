-- ClipIt — profile pictures.
--
-- Run in the Supabase SQL editor (like the earlier migrations). Idempotent and
-- safe to re-run; the "destructive operations" warning is just the
-- drop-policy-if-exists lines, which immediately recreate. Until this runs,
-- everyone shows the colored-initial avatar; nothing else breaks.

-- Where each profile's avatar lives (a public URL into the bucket below).
alter table public.profiles add column if not exists avatar_url text;

-- Public bucket for avatars: reads via the public URL, writes gated per-user.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can read avatars (they appear all over the shared feed).
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

-- Signed-in users can upload only into their own folder (path is "<uid>/...").
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ...and replace/remove their own avatar.
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
