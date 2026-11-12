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
select t.is('buckets limited to images of 5 MB', (select string_agg(id || ':' || file_size_limit || ':' || array_length(allowed_mime_types, 1), ',' order by id) from storage.buckets), 'avatars:5242880:3,feed-photos:5242880:3');

-- 9. existing features still work
select t.is('account deletion still works', t.try(:'C', 'select public.delete_my_account()'), 'ok:1');
select t.is('…and removed the account''s rows', (select count(*)::text from public.profiles where id = :'C'), '0');
