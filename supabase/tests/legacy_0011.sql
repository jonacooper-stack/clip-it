-- Rows written before migration 0011 (by an app that scores on the phone and
-- filters language only in the app). They must survive it untouched.
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000e0');
insert into public.profiles (id, display_name, points, species_count) values
  ('00000000-0000-4000-8000-0000000000e0', 'Old shit name', 420, 9);
insert into public.feed_posts (id, user_id, common_name, points, caption) values
  ('10000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000e0', 'Red fox', 44, 'holy shit a fox');
insert into public.post_comments (id, post_id, user_id, body) values
  ('30000000-0000-4000-8000-0000000000e0', '10000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000e0', 'what the fuck');
