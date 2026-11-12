-- Rows written before the hardening that the new limits would refuse: they must survive it.
insert into auth.users (id) values ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b'), ('00000000-0000-4000-8000-00000000000c'), ('00000000-0000-4000-8000-0000000000d0');
insert into public.profiles (id, display_name, points, avatar_url) values
  ('00000000-0000-4000-8000-0000000000d0', repeat('x', 100), 12, 'https://elsewhere.example/a.png');
insert into public.feed_posts (id, user_id, common_name, photo_url, points) values
  ('10000000-0000-4000-8000-0000000000d0', '00000000-0000-4000-8000-0000000000d0', 'Legacy post', 'https://elsewhere.example/p.jpg', 9000);
insert into storage.buckets (id, name, public) values ('feed-photos', 'feed-photos', true), ('avatars', 'avatars', true) on conflict do nothing;
