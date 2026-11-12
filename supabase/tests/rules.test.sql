\set QUIET on
create schema t;
-- Run one statement the way the API would (as a signed-in player, the service role, or nobody).
create function t.try(who text, stmt text) returns text language plpgsql as $$
declare n bigint;
begin
  if who = 'service' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
  elsif who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  begin
    execute stmt;
    get diagnostics n = row_count;
    reset role;
    return 'ok:' || n;
  exception when others then
    reset role;
    return 'error:' || sqlstate;
  end;
end $$;
create function t.is(label text, got text, want text) returns void language plpgsql as $$
begin
  raise notice '% %   (%)', case when got = want then 'PASS' else 'FAIL' end, label, got;
end $$;

-- Run a statement as someone, then read back what is in the table now. (The
-- two can't share one SELECT: a query doesn't see changes made by a function
-- it calls itself.)
create function t.then_(who text, stmt text, readback text) returns text language plpgsql as $$
declare r text; v text;
begin
  r := t.try(who, stmt);
  execute readback into v;
  return r || '/' || coalesce(v, '<NULL>');
end $$;

\set A '00000000-0000-4000-8000-00000000000a'
\set B '00000000-0000-4000-8000-00000000000b'
\set C '00000000-0000-4000-8000-00000000000c'
\set D '00000000-0000-4000-8000-0000000000d0'

-- legacy rows survived the migration, and can still be read
select t.is('legacy over-limit rows were left alone', (select count(*)::text from public.feed_posts where points = 9000), '1');

-- 1. usage counters
select t.is('service role counts usage: first call', t.try('service', format('select public.bump_usage(%L, ''identify'')', :'A')), 'ok:1');
select t.try('service', format('select public.bump_usage(%L, ''identify'')', :'A'));
select t.is('usage count is cumulative per day', (select count::text from public.usage_counters where user_id = :'A' and kind = 'identify'), '2');
select t.is('a player cannot bump (or reset) counters', t.try(:'A', format('select public.bump_usage(%L, ''identify'')', :'A')), 'error:42501');
select t.is('a player cannot read counters', t.try(:'A', 'select * from public.usage_counters'), 'ok:0');
select t.is('anon cannot bump counters', t.try('anon', format('select public.bump_usage(%L, ''identify'')', :'A')), 'error:42501');

-- 2. profiles
select t.is('player creates own profile', t.try(:'A', format('insert into public.profiles (id, display_name, points) values (%L, ''Alex'', 10)', :'A')), 'ok:1');
select t.try(:'B', format('insert into public.profiles (id, display_name) values (%L, ''Bea'')', :'B'));
select t.try(:'C', format('insert into public.profiles (id, display_name) values (%L, ''Cam'')', :'C'));
select t.is('cannot create a profile for someone else', t.try(:'A', 'insert into public.profiles (id, display_name) values (gen_random_uuid(), ''Ghost'')'), 'error:42501');
select t.is('reserved name "Scout" refused', t.try(:'A', format('update public.profiles set display_name = ''  scout '' where id = %L', :'A')), 'error:P0001');
select t.is('reserved name containing "ClipIt" refused', t.try(:'A', format('update public.profiles set display_name = ''ClipIt Team'' where id = %L', :'A')), 'error:P0001');
select t.is('ordinary rename allowed', t.try(:'A', format('update public.profiles set display_name = ''Alexandra'' where id = %L', :'A')), 'ok:1');
select t.is('61-character name refused', t.try(:'A', format('update public.profiles set display_name = repeat(''a'', 61) where id = %L', :'A')), 'error:23514');
select t.is('negative points refused', t.try(:'A', format('update public.profiles set points = -5 where id = %L', :'A')), 'error:23514');
select t.is('absurd points refused', t.try(:'A', format('update public.profiles set points = 2000000000 where id = %L', :'A')), 'error:23514');
select t.is('points update within range allowed', t.try(:'A', format('update public.profiles set points = 250, species_count = 12 where id = %L', :'A')), 'ok:1');
select t.is('avatar on another server refused', t.try(:'A', format('update public.profiles set avatar_url = ''https://evil.example/x.png'' where id = %L', :'A')), 'error:23514');
select t.is('avatar in someone else''s folder refused', t.try(:'A', format('update public.profiles set avatar_url = ''https://p.supabase.co/storage/v1/object/public/avatars/%s/a.jpg'' where id = %L', :'B', :'A')), 'error:23514');
select t.is('avatar in own folder allowed', t.try(:'A', format('update public.profiles set avatar_url = ''https://p.supabase.co/storage/v1/object/public/avatars/%s/a.jpg'' where id = %L', :'A', :'A')), 'ok:1');
select t.is('cannot mark self as bot', (select t.try(:'A', format('update public.profiles set is_bot = true where id = %L', :'A')) || '/' || (select is_bot::text from public.profiles where id = :'A')), 'ok:1/false');
select t.is('cannot edit another player''s profile', t.try(:'A', format('update public.profiles set points = 0 where id = %L', :'B')), 'ok:0');
select t.is('legacy over-limit profile can still sync points once renamed', t.try(:'D', format('update public.profiles set display_name = ''Dee'', avatar_url = null, points = 20 where id = %L', :'D')), 'ok:1');

-- 3. wall posts
select t.is('post with own-folder photo allowed', t.try(:'B', format('insert into public.feed_posts (id, user_id, common_name, points, photo_url) values (''20000000-0000-4000-8000-00000000000b'', %L, ''Osprey'', 12, ''https://p.supabase.co/storage/v1/object/public/feed-photos/%s/1.jpg'')', :'B', :'B')), 'ok:1');
select t.is('post with a photo on another server refused', t.try(:'A', format('insert into public.feed_posts (user_id, common_name, photo_url) values (%L, ''Fox'', ''https://evil.example/pixel.gif'')', :'A')), 'error:23514');
select t.is('post with 501 points refused', t.try(:'A', format('insert into public.feed_posts (user_id, common_name, points) values (%L, ''Fox'', 501)', :'A')), 'error:23514');
select t.is('post with a 600-character caption refused', t.try(:'A', format('insert into public.feed_posts (user_id, caption) values (%L, repeat(''c'', 600))', :'A')), 'error:23514');
select t.is('cannot post as someone else', t.try(:'A', format('insert into public.feed_posts (user_id, common_name) values (%L, ''Fox'')', :'B')), 'error:42501');

-- 4. comments
select t.is('comment allowed', t.try(:'C', format('insert into public.post_comments (post_id, user_id, body) values (''20000000-0000-4000-8000-00000000000b'', %L, ''Nice!'')', :'C')), 'ok:1');
select t.is('empty comment refused', t.try(:'C', format('insert into public.post_comments (post_id, user_id, body) values (''20000000-0000-4000-8000-00000000000b'', %L, '''')', :'C')), 'error:23514');
select t.is('1001-character comment refused', t.try(:'C', format('insert into public.post_comments (post_id, user_id, body) values (''20000000-0000-4000-8000-00000000000b'', %L, repeat(''z'', 1001))', :'C')), 'error:23514');

-- 5. friend requests
select t.is('request cannot start out accepted', t.try(:'A', format('insert into public.friendships (requester_id, addressee_id, status) values (%L, %L, ''accepted'')', :'A', :'C')), 'error:42501');
select t.is('pending request allowed', t.try(:'A', format('insert into public.friendships (requester_id, addressee_id, status) values (%L, %L, ''pending'')', :'A', :'C')), 'ok:1');
select t.is('sender cannot accept their own request', t.try(:'A', format('update public.friendships set status = ''accepted'' where requester_id = %L', :'A')), 'ok:0');
select t.is('still pending after the sender tried', (select status from public.friendships where requester_id = :'A' and addressee_id = :'C'), 'pending');
select t.is('addressee cannot rewrite who sent it', t.try(:'C', format('update public.friendships set requester_id = %L where addressee_id = %L', :'B', :'C')), 'error:42501');
select t.is('addressee can accept', t.try(:'C', format('update public.friendships set status = ''accepted'' where addressee_id = %L', :'C')), 'ok:1');
select t.is('either side can remove it', t.try(:'A', format('delete from public.friendships where requester_id = %L', :'A')), 'ok:1');

-- 6. blocking: B blocks A
select t.is('B blocks A', t.try(:'B', format('insert into public.user_blocks (blocker_id, blocked_id) values (%L, %L)', :'B', :'A')), 'ok:1');
select t.is('blocked player cannot comment on the blocker''s post', t.try(:'A', format('insert into public.post_comments (post_id, user_id, body) values (''20000000-0000-4000-8000-00000000000b'', %L, ''hi'')', :'A')), 'error:42501');
select t.is('blocked player cannot like the blocker''s post', t.try(:'A', format('insert into public.post_likes (post_id, user_id) values (''20000000-0000-4000-8000-00000000000b'', %L)', :'A')), 'error:42501');
select t.is('blocked player cannot follow the blocker', t.try(:'A', format('insert into public.follows (follower_id, following_id) values (%L, %L)', :'A', :'B')), 'error:42501');
select t.is('blocked player cannot send a friend request', t.try(:'A', format('insert into public.friendships (requester_id, addressee_id) values (%L, %L)', :'A', :'B')), 'error:42501');
select t.is('someone not blocked can still like', t.try(:'C', format('insert into public.post_likes (post_id, user_id) values (''20000000-0000-4000-8000-00000000000b'', %L)', :'C')), 'ok:1');
select t.is('someone not blocked can still follow', t.try(:'C', format('insert into public.follows (follower_id, following_id) values (%L, %L)', :'C', :'B')), 'ok:1');
select t.is('blocked player cannot see the block list', t.try(:'A', 'select * from public.user_blocks'), 'ok:0');
select t.is('block check is not in the API schema', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'blocked_by' and n.nspname = 'public'), '0');

-- 7. follows are private to the two people involved
select t.is('A cannot see that C follows B', t.try(:'A', 'select * from public.follows'), 'ok:0');
select t.is('C sees their own follow', t.try(:'C', 'select * from public.follows'), 'ok:1');
select t.is('B sees who follows them', t.try(:'B', 'select * from public.follows'), 'ok:1');

-- 8. reports and storage
select t.is('report allowed', t.try(:'C', format('insert into public.content_reports (reporter_id, target_type, target_id, reason) values (%L, ''post'', gen_random_uuid(), ''Spam or scam'')', :'C')), 'ok:1');
select t.is('report with 5000 characters of details refused', t.try(:'C', format('insert into public.content_reports (reporter_id, target_type, target_id, reason, details) values (%L, ''post'', gen_random_uuid(), ''Spam'', repeat(''d'', 5000))', :'C')), 'error:23514');
select t.is('buckets limited to images of 5 MB', (select string_agg(id || ':' || file_size_limit || ':' || array_length(allowed_mime_types, 1), ',' order by id) from storage.buckets), 'avatars:5242880:3,feed-photos:5242880:3,journal-photos:5242880:3');

-- ===================== 0011: cloud journal, server-kept scores =====================
\set E '00000000-0000-4000-8000-0000000000e0'
\set F '00000000-0000-4000-8000-0000000000f0'
insert into auth.users (id) values (:'F');

-- 10. rows from before the migration are untouched
select t.is('legacy profile kept its name and score', (select display_name || '/' || points || '/' || species_count from public.profiles where id = :'E'), 'Old shit name/420/9');
select t.is('legacy post and comment kept', (select caption from public.feed_posts where id = '10000000-0000-4000-8000-0000000000e0') || '|' || (select body from public.post_comments where id = '30000000-0000-4000-8000-0000000000e0'), 'holy shit a fox|what the fuck');
select t.is('the legacy window starts open, about 30 days long', (select (private.legacy_open() and (value #>> '{}')::timestamptz between now() + interval '29 days' and now() + interval '31 days')::text from public.app_settings where key = 'legacy_import_until'), 'true');

-- 11. the journal: the owner reads it, only the server writes it
select t.is('server records a sighting for A', t.try('service', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, common_name, scientific_name, points, verified, lat, lng) values (%L, 'sight-a-1', now(), now(), 'ai_confident', 'Osprey', 'Pandion haliaetus', 7, true, 44.1, -72.5), (%L, 'sight-a-2', now(), now(), 'ai_confident', 'Red fox', 'Vulpes vulpes', 3, true, null, null)$q$, :'A', :'A')), 'ok:2');
select t.is('server records a sighting for B', t.try('service', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, common_name, scientific_name, points, verified, lat, lng) values (%L, 'sight-b-1', now(), now(), 'ai_confident', 'Bald eagle', 'Haliaeetus leucocephalus', 30, true, 40.7, -74.0)$q$, :'B')), 'ok:1');
select t.is('A reads their own journal', t.try(:'A', 'select * from public.journal_sightings'), 'ok:2');
select t.is('A cannot read B''s journal (or where B was)', t.try(:'A', format('select lat, lng from public.journal_sightings where user_id = %L', :'B')), 'ok:0');
select t.is('anon reads nothing', t.try('anon', 'select * from public.journal_sightings'), 'ok:0');
select t.is('a player cannot add a sighting', t.try(:'A', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, points, verified) values (%L, 'sight-a-9', now(), now(), 'ai_confident', 500, true)$q$, :'A')), 'error:42501');
select t.is('a player cannot change a sighting''s points', t.try(:'A', 'update public.journal_sightings set points = 500'), 'error:42501');
select t.is('a player cannot delete a sighting directly', t.try(:'A', 'delete from public.journal_sightings'), 'error:42501');
select t.is('the same sighting id cannot be recorded twice', t.try('service', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, points) values (%L, 'sight-a-1', now(), now(), 'ai_confident', 9)$q$, :'A')), 'error:23505');
select t.is('a sighting id must be a plain token', t.try('service', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, points) values (%L, '../x', now(), now(), 'ai_confident', 1)$q$, :'A')), 'error:23514');
select t.is('points above 500 refused even from the server', t.try('service', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, points) values (%L, 'sight-a-big', now(), now(), 'ai_confident', 501)$q$, :'A')), 'error:23514');

-- 12. account state: readable by its owner, written only by the server
select t.is('server writes A''s state', t.try('service', format('insert into public.journal_state (user_id, tz) values (%L, ''America/New_York'')', :'A')), 'ok:1');
select t.is('A reads their own state', t.try(:'A', 'select * from public.journal_state'), 'ok:1');
select t.is('B cannot read A''s state', t.try(:'B', 'select * from public.journal_state'), 'ok:0');
select t.is('a player cannot mark their own journal ready', t.try(:'A', 'update public.journal_state set ready_at = now(), carryover_points = 99999'), 'error:42501');
select t.is('a player cannot create their own state', t.try(:'B', format('insert into public.journal_state (user_id, carryover_points) values (%L, 5000)', :'B')), 'error:42501');
select t.is('settings are invisible to players', t.try(:'A', 'select * from public.app_settings'), 'ok:0');
select t.is('a player cannot move the legacy window', t.try(:'A', $q$update public.app_settings set value = to_jsonb(now() + interval '10 years')$q$), 'ok:0');
select t.is('the window check is not in the API schema', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname in ('legacy_open', 'has_blocked_language') and n.nspname = 'public'), '0');

-- 13. the leaderboard score
-- (a) an app that hasn't updated yet, during the legacy window: its own number is still accepted
select t.is('old app, window open: reported score accepted', t.then_(:'A', format('update public.profiles set points = 300, species_count = 12 where id = %L', :'A'), format($r$select points || '/' || species_count from public.profiles where id = %L$r$, :'A')), 'ok:1/300/12');
-- (b) once the account's journal is in the cloud, the app's number is ignored
select t.try('service', format('update public.journal_state set ready_at = now() where user_id = %L', :'A'));
select t.is('switched account: reported score ignored', t.then_(:'A', format('update public.profiles set points = 999999, species_count = 500 where id = %L', :'A'), format($r$select points || '/' || species_count from public.profiles where id = %L$r$, :'A')), 'ok:1/300/12');
select t.is('switched account: upsert cannot raise the score either', t.then_(:'A', format('insert into public.profiles (id, display_name, points) values (%L, ''Alexandra'', 4000) on conflict (id) do update set points = excluded.points', :'A'), format($r$select points::text from public.profiles where id = %L$r$, :'A')), 'ok:1/300');
select t.is('switched account can still rename', t.then_(:'A', format('update public.profiles set display_name = ''Alex R'' where id = %L', :'A'), format($r$select display_name from public.profiles where id = %L$r$, :'A')), 'ok:1/Alex R');
select t.is('the server sets the score', t.then_('service', format('update public.profiles set points = 10, species_count = 2 where id = %L', :'A'), format($r$select points || '/' || species_count from public.profiles where id = %L$r$, :'A')), 'ok:1/10/2');
select t.try('service', format('insert into public.journal_state (user_id, ready_at) values (%L, now())', :'F'));
select t.is('switched account: a new profile starts at zero whatever the app says', t.then_(:'F', format('insert into public.profiles (id, display_name, points, species_count) values (%L, ''Fay'', 5000, 80)', :'F'), format($r$select points || '/' || species_count from public.profiles where id = %L$r$, :'F')), 'ok:1/0/0');

-- 14. wall posts take their facts from the journal
select t.is('a post that shares a sighting gets the journal''s points and species, not the app''s', t.then_(:'A', format($q$insert into public.feed_posts (id, user_id, common_name, scientific_name, points, sighting_id) values ('20000000-0000-4000-8000-0000000000a1', %L, 'Dragon', 'Draco fictus', 499, 'sight-a-1')$q$, :'A'), $r$select points || '/' || common_name || '/' || scientific_name from public.feed_posts where id = '20000000-0000-4000-8000-0000000000a1'$r$), 'ok:1/7/Osprey/Pandion haliaetus');
select t.is('the same sighting cannot be shared twice', t.try(:'A', format($q$insert into public.feed_posts (user_id, common_name, points, sighting_id) values (%L, 'Osprey', 7, 'sight-a-1')$q$, :'A')), 'error:23505');
select t.is('someone else''s sighting id earns nothing extra: the app''s (bounded) value is kept during the window', t.then_(:'A', format($q$insert into public.feed_posts (id, user_id, common_name, points, sighting_id) values ('20000000-0000-4000-8000-0000000000a2', %L, 'Bald eagle', 30, 'sight-b-1')$q$, :'A'), $r$select points::text from public.feed_posts where id = '20000000-0000-4000-8000-0000000000a2'$r$), 'ok:1/30');
select t.is('a sighting id must be a plain token', t.try(:'A', format($q$insert into public.feed_posts (user_id, common_name, sighting_id) values (%L, 'Fox', 'x y')$q$, :'A')), 'error:23514');
select t.try('service', format($q$update public.journal_sightings set deleted_at = now(), common_name = null, scientific_name = null, points = 0 where user_id = %L and id = 'sight-a-2'$q$, :'A'));
select t.is('a deleted sighting is not a source of points', t.then_(:'A', format($q$insert into public.feed_posts (id, user_id, common_name, points, sighting_id) values ('20000000-0000-4000-8000-0000000000a3', %L, 'Red fox', 3, 'sight-a-2')$q$, :'A'), $r$select points || '/' || common_name from public.feed_posts where id = '20000000-0000-4000-8000-0000000000a3'$r$), 'ok:1/3/Red fox');
select t.is('old app (no sighting id), window open: post accepted as before', t.then_(:'D', format($q$insert into public.feed_posts (id, user_id, common_name, points) values ('20000000-0000-4000-8000-0000000000d1', %L, 'Robin', 5)$q$, :'D'), $r$select points::text from public.feed_posts where id = '20000000-0000-4000-8000-0000000000d1'$r$), 'ok:1/5');

-- 15. blocked language is refused by the database too
select t.is('comment with blocked language refused', t.try(:'A', format($q$insert into public.post_comments (post_id, user_id, body) values ('20000000-0000-4000-8000-0000000000a1', %L, 'this is shit')$q$, :'A')), 'error:23514');
select t.is('…also when disguised', t.try(:'A', format($q$insert into public.post_comments (post_id, user_id, body) values ('20000000-0000-4000-8000-0000000000a1', %L, 'what a sh1t photo')$q$, :'A')), 'error:23514');
select t.is('…or spaced out', t.try(:'A', format($q$insert into public.post_comments (post_id, user_id, body) values ('20000000-0000-4000-8000-0000000000a1', %L, 'f u c k')$q$, :'A')), 'error:23514');
select t.is('bird names that only contain such letters are fine', t.try(:'A', format($q$insert into public.post_comments (post_id, user_id, body) values ('20000000-0000-4000-8000-0000000000a1', %L, 'A woodcock and a Dickcissel, what a day')$q$, :'A')), 'ok:1');
select t.is('caption with blocked language refused', t.try(:'A', format($q$insert into public.feed_posts (user_id, common_name, caption) values (%L, 'Fox', 'look at this bitch')$q$, :'A')), 'error:23514');
select t.is('species name with blocked language refused (when not taken from the journal)', t.try(:'A', format($q$insert into public.feed_posts (user_id, common_name) values (%L, 'Fuck')$q$, :'A')), 'error:23514');
select t.is('a blocked display name is not saved: the old name stays', t.then_(:'A', format('update public.profiles set display_name = ''Sh1t Lord'' where id = %L', :'A'), format($r$select display_name from public.profiles where id = %L$r$, :'A')), 'ok:1/Alex R');
select t.try('service', format('delete from public.profiles where id = %L', :'E'));
select t.is('a blocked name on a new profile becomes "Explorer" (the profile is still created)', t.then_(:'E', format('insert into public.profiles (id, display_name) values (%L, ''fuck face'')', :'E'), format($r$select display_name from public.profiles where id = %L$r$, :'E')), 'ok:1/Explorer');
select t.is('the server''s own text is not filtered (Scout quoting a bird name)', t.try('service', format($q$insert into public.post_comments (post_id, user_id, body) values ('20000000-0000-4000-8000-0000000000a1', %L, 'A cock pheasant!')$q$, :'A')), 'ok:1');

-- 16. journal photos are private
select t.is('the journal photo bucket is private', (select public::text from storage.buckets where id = 'journal-photos'), 'false');
select t.try('service', format($q$insert into storage.objects (bucket_id, name) values ('journal-photos', '%s/sight-a-1.jpg'), ('journal-photos', '%s/sight-b-1.jpg')$q$, :'A', :'B'));
select t.is('A sees only their own journal photos', t.try(:'A', $q$select * from storage.objects where bucket_id = 'journal-photos'$q$), 'ok:1');
select t.is('anon sees no journal photos', t.try('anon', $q$select * from storage.objects where bucket_id = 'journal-photos'$q$), 'ok:0');
select t.is('a player cannot upload into the journal bucket (the server stores the copies)', t.try(:'A', format($q$insert into storage.objects (bucket_id, name) values ('journal-photos', '%s/junk.jpg')$q$, :'A')), 'error:42501');
select t.is('A cannot delete B''s journal photo', t.try(:'A', format($q$delete from storage.objects where bucket_id = 'journal-photos' and name like '%s/%%'$q$, :'B')), 'ok:0');
select t.is('A can delete their own journal photos (account deletion)', t.try(:'A', $q$delete from storage.objects where bucket_id = 'journal-photos'$q$), 'ok:1');

-- 17. after the legacy window closes
select t.try('service', $q$update public.app_settings set value = to_jsonb(now() - interval '1 minute') where key = 'legacy_import_until'$q$);
select t.is('the window is closed', (select private.legacy_open()::text), 'false');
select t.is('window closed: an app that never updated can no longer report a score', t.then_(:'B', format('update public.profiles set points = 777 where id = %L', :'B'), format($r$select points::text from public.profiles where id = %L$r$, :'B')), 'ok:1/0');
select t.is('window closed: a post without a journal sighting carries no points', t.then_(:'D', format($q$insert into public.feed_posts (id, user_id, common_name, points) values ('20000000-0000-4000-8000-0000000000d2', %L, 'Robin', 400)$q$, :'D'), $r$select points::text from public.feed_posts where id = '20000000-0000-4000-8000-0000000000d2'$r$), 'ok:1/0');
select t.is('window closed: a post that shares a real sighting still gets its points', t.then_(:'B', format($q$insert into public.feed_posts (id, user_id, common_name, points, sighting_id) values ('20000000-0000-4000-8000-0000000000b9', %L, 'x', 1, 'sight-b-1')$q$, :'B'), $r$select points::text from public.feed_posts where id = '20000000-0000-4000-8000-0000000000b9'$r$), 'ok:1/30');
select t.try('service', $q$delete from public.app_settings where key = 'legacy_import_until'$q$);
select t.is('no setting at all counts as closed', (select private.legacy_open()::text), 'false');

-- 18. deleting an account removes its journal
select t.try('service', format($q$insert into public.journal_sightings (user_id, id, observed_at, logged_at, status, points) values (%L, 'sight-c-1', now(), now(), 'ai_confident', 4)$q$, :'C'));
select t.try('service', format('insert into public.journal_state (user_id) values (%L)', :'C'));

-- 9. existing features still work
select t.is('account deletion still works', t.try(:'C', 'select public.delete_my_account()'), 'ok:1');
select t.is('…and removed the account''s rows', (select count(*)::text from public.profiles where id = :'C'), '0');
select t.is('…including its journal and state', (select count(*)::text from public.journal_sightings where user_id = :'C') || '/' || (select count(*)::text from public.journal_state where user_id = :'C'), '0/0');
