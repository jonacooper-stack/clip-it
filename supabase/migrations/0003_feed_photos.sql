-- ClipIt — wall photos: a public Storage bucket for shared sighting photos.
--
-- Run this in the Supabase SQL editor (same as 0002_social.sql). Idempotent and
-- safe to re-run. The "destructive operations" warning is just the
-- drop-policy-if-exists lines (they recreate immediately). Until this runs,
-- sharing to the wall still works — it simply won't attach a photo.

-- Public bucket: reads are served via the public URL; writes are gated by the
-- policies below.
insert into storage.buckets (id, name, public)
values ('feed-photos', 'feed-photos', true)
on conflict (id) do nothing;

-- Anyone can read wall photos (the wall is a shared, de-identified feed).
drop policy if exists feed_photos_read on storage.objects;
create policy feed_photos_read on storage.objects
  for select using (bucket_id = 'feed-photos');

-- Signed-in users can upload only into their own folder (path is "<uid>/...").
drop policy if exists feed_photos_insert on storage.objects;
create policy feed_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feed-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ...and remove their own uploads.
drop policy if exists feed_photos_delete on storage.objects;
create policy feed_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'feed-photos' and (storage.foldername(name))[1] = auth.uid()::text);
