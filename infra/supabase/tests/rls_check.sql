-- RLS verification.
--
-- The pre-launch checklist requires proving that a regular user cannot read
-- another user's data, and that only admins can write content. Checking the UI
-- is not proof — the UI is not what enforces it. This impersonates a real user
-- at the database level, which is where the enforcement actually lives.
--
-- Run:  ./scripts/psql.sh -f tests/rls_check.sql
-- Every line should print PASS. Any FAIL is a policy bug.

\set ON_ERROR_STOP off

begin;

create or replace function pg_temp.report(label text, condition boolean)
returns void language plpgsql as $$
begin
  raise notice '% - %', case when condition then 'PASS' else 'FAIL' end, label;
end $$;

-- Two throwaway users we can impersonate. Everything is rolled back at the end,
-- so this leaves no trace in the real data.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-user-a@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls-user-b@test.local');

insert into public.artists (id, name)
  values ('00000000-0000-0000-0000-0000000000c1', 'RLS Test Artist');
insert into public.tracks (id, artist_id, title, spotify_url)
  values ('00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000c1',
          'RLS Test Track',
          'https://open.spotify.com/track/TEST');

-- Become user A. This is exactly what PostgREST does for a signed-in client.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.report('a user can read their own profile',
  (select count(*) = 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'));

select pg_temp.report('a user CANNOT read another user''s profile',
  (select count(*) = 0 from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'));

select pg_temp.report('artists are publicly readable',
  (select count(*) >= 1 from public.artists));

select pg_temp.report('tracks are publicly readable',
  (select count(*) >= 1 from public.tracks));

select pg_temp.report('a user CANNOT read link_clicks',
  (select count(*) = 0 from public.link_clicks));

-- Writes that must be refused. Each is wrapped so a rejection records a PASS
-- rather than aborting the script.
do $$
declare ok boolean := false;
begin
  begin
    insert into public.artists (name) values ('should not exist');
  exception when others then ok := true;
  end;
  raise notice '% - a non-admin CANNOT create an artist', case when ok then 'PASS' else 'FAIL' end;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    update public.profiles set role = 'admin'
      where id = '00000000-0000-0000-0000-0000000000a1';
    -- If the update did not throw, the WITH CHECK must still have kept the
    -- role unchanged.
    ok := not exists (
      select 1 from public.profiles
      where id = '00000000-0000-0000-0000-0000000000a1' and role = 'admin');
  exception when others then ok := true;
  end;
  raise notice '% - a user CANNOT promote themselves to admin', case when ok then 'PASS' else 'FAIL' end;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.link_clicks (track_id, user_id, platform)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000a2', 'spotify');
  exception when others then ok := true;
  end;
  raise notice '% - a user CANNOT log a click as someone else', case when ok then 'PASS' else 'FAIL' end;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into public.link_clicks (track_id, user_id, platform)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000a1', 'spotify');
    ok := true;
  exception when others then ok := false;
  end;
  raise notice '% - a user CAN log their own click', case when ok then 'PASS' else 'FAIL' end;
end $$;

reset role;
rollback;
