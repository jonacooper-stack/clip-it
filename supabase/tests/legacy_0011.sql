-- Rows written before migration 0011 (by an app that scores on the phone and
-- filters language only in the app). They must survive it untouched.
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000e0');
insert into public.profiles (id, display_name, points, species_count) values
  ('00000000-0000-4000-8000-0000000000e0', 'Old shit name', 420, 9);
insert into public.feed_posts (id, user_id, common_name, points, caption) values
  ('10000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000e0', 'Red fox', 44, 'holy shit a fox');
insert into public.post_comments (id, post_id, user_id, body) values
  ('30000000-0000-4000-8000-0000000000e0', '10000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000e0', 'what the fuck');

-- Accounts of different ages and scores, to pin down what each may bring from
-- before the switch (the allowance for phone-scored sightings):
--   b1 idle for two months with 38 points; b2 a regular with 1,400;
--   b3 never opened the Community tab (no leaderboard row); b4 an absurd score.
insert into auth.users (id, created_at) values
  ('00000000-0000-4000-8000-0000000000b1', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000000b2', now() - interval '200 days'),
  ('00000000-0000-4000-8000-0000000000b3', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000000b4', now() - interval '400 days');
insert into public.profiles (id, display_name, points, species_count) values
  ('00000000-0000-4000-8000-0000000000b1', 'Idle', 38, 3),
  ('00000000-0000-4000-8000-0000000000b2', 'Regular', 1400, 41),
  ('00000000-0000-4000-8000-0000000000b4', 'Whale', 30000, 900);
