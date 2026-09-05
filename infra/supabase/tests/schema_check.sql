-- Schema and trigger verification: constraints, referral code generation, and
-- referral attribution at signup. Complements tests/rls_check.sql, which covers
-- access control.
--
-- Run:  ./scripts/psql.sh -f tests/schema_check.sql
-- Every line should print PASS. Everything is rolled back at the end.

\set ON_ERROR_STOP off

create or replace function pg_temp.report(label text, ok boolean)
returns void language plpgsql as $$
begin
  raise notice '% - %', case when ok then 'PASS' else 'FAIL' end, label;
end $$;

begin;

insert into public.artists (id, name)
  values ('00000000-0000-0000-0000-0000000000e1', 'Schema Test Artist');

-- A track that routes nowhere is useless in an app with no in-app playback.
do $$
declare ok boolean := false;
begin
  begin
    insert into public.tracks (artist_id, title)
      values ('00000000-0000-0000-0000-0000000000e1', 'no links');
  exception when others then ok := true;
  end;
  raise notice '% - a track with no streaming link is rejected', case when ok then 'PASS' else 'FAIL' end;
end $$;

-- Guards against an admin pasting the wrong platform's URL into a field, which
-- would otherwise make the app generate a native link to the wrong app.
do $$
declare ok boolean := false;
begin
  begin
    insert into public.tracks (artist_id, title, spotify_url)
      values ('00000000-0000-0000-0000-0000000000e1', 'bad', 'https://evil.example.com/track/1');
  exception when others then ok := true;
  end;
  raise notice '% - a non-Spotify URL in spotify_url is rejected', case when ok then 'PASS' else 'FAIL' end;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.tracks (artist_id, title, youtube_url)
      values ('00000000-0000-0000-0000-0000000000e1', 'ok', 'https://youtu.be/abc');
    ok := true;
  exception when others then ok := false;
  end;
  raise notice '% - a valid youtu.be URL is accepted', case when ok then 'PASS' else 'FAIL' end;
end $$;

-- Referral codes: generated server-side, unique under volume, and free of
-- glyphs that get misread when a code is spoken aloud or typed off a screenshot.
insert into auth.users (id, email)
  select gen_random_uuid(), 'schema-seed-' || g || '@test.local' from generate_series(1, 200) g;

select pg_temp.report('200 signups produced 200 unique referral codes',
  (select count(distinct referral_code) = 200 and count(*) = 200 from public.profiles));

select pg_temp.report('referral codes exclude the ambiguous glyphs 0 O 1 I L',
  (select bool_and(referral_code !~ '[01OIL]') from public.profiles));

select pg_temp.report('referral codes are all 7 characters',
  (select bool_and(length(referral_code) = 7) from public.profiles));

-- Attribution happens inside the signup trigger, so it cannot be skipped or
-- replayed by a client that simply never makes the second call.
do $$
declare code text; new_id uuid := gen_random_uuid(); ref uuid;
begin
  select referral_code into code from public.profiles limit 1;
  insert into auth.users (id, email, raw_user_meta_data)
    values (new_id, 'referred@test.local', jsonb_build_object('referral_code', code));
  select referred_by into ref from public.profiles where id = new_id;
  raise notice '% - a signup carrying a referral code is attributed to the referrer',
    case when ref is not null then 'PASS' else 'FAIL' end;
end $$;

do $$
declare new_id uuid := gen_random_uuid(); ref uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (new_id, 'bogus@test.local', jsonb_build_object('referral_code', 'ZZZZZZZ'));
  select referred_by into ref from public.profiles where id = new_id;
  raise notice '% - an unknown referral code is ignored and signup still succeeds',
    case when ref is null then 'PASS' else 'FAIL' end;
end $$;

rollback;
