-- Access control: BUILD-SPEC section 15, "Privilege and access".
--
-- Every assertion impersonates a real role at the database level, exactly as
-- PostgREST does for a signed-in client. Checking that the UI hides a control
-- is not evidence; this is.
--
-- Run:  ./scripts/psql.sh -f tests/01_access_control.sql
-- Every line must print PASS.

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

create or replace function pg_temp.report(label text, ok boolean)
returns void language plpgsql as $$
begin
  raise notice '% - %', case when ok then 'PASS' else 'FAIL' end, label;
end $$;

-- Runs a statement that must be refused, and reports PASS when it is.
create or replace function pg_temp.must_fail(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
    raise notice 'FAIL - % (statement was allowed)', label;
  exception when others then
    raise notice 'PASS - %', label;
  end;
end $$;

\i tests/seed_fixture.sql

-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';

select pg_temp.report('fan reads their own profile',
  (select count(*) = 1 from public.profiles where id = '00000000-0000-0000-0000-00000000a001'));

select pg_temp.report('fan CANNOT read another fan''s profile',
  (select count(*) = 0 from public.profiles where id = '00000000-0000-0000-0000-00000000a002'));

select pg_temp.report('fan CANNOT read another user''s roles',
  (select count(*) = 0 from public.user_roles where user_id = '00000000-0000-0000-0000-00000000a006'));

select pg_temp.report('artists and tracks are publicly readable',
  (select count(*) >= 2 from public.artists) and (select count(*) >= 2 from public.tracks));

select pg_temp.report('fan CANNOT read link_clicks',
  (select count(*) = 0 from public.link_clicks));

select pg_temp.report('fan CANNOT read the audit log',
  (select count(*) = 0 from public.audit_log));

select pg_temp.report('fan CANNOT read abuse flags raised about them',
  (select count(*) = 0 from public.abuse_flags));

select pg_temp.report('fan CANNOT read notification targeting',
  (select count(*) = 0 from public.notification_campaigns));

-- Loophole 1: self-promotion.
select pg_temp.must_fail('fan CANNOT grant themselves the admin role',
  $$insert into public.user_roles (user_id, role_code)
    values ('00000000-0000-0000-0000-00000000a001','admin')$$);

-- Loophole 1 again, via the profile row rather than the role table.
do $$
declare changed boolean;
begin
  begin
    update public.profiles set referral_code = 'HACKED1'
      where id = '00000000-0000-0000-0000-00000000a001';
    changed := exists (select 1 from public.profiles
                       where id = '00000000-0000-0000-0000-00000000a001'
                         and referral_code = 'HACKED1');
  exception when others then changed := false;
  end;
  raise notice '% - fan CANNOT rewrite their own referral code',
    case when changed then 'FAIL' else 'PASS' end;
end $$;

do $$
declare changed boolean;
begin
  begin
    update public.profiles set is_banned = false, phone_verified_at = now()
      where id = '00000000-0000-0000-0000-00000000a001';
    changed := exists (select 1 from public.profiles
                       where id = '00000000-0000-0000-0000-00000000a001'
                         and phone_verified_at is not null);
  exception when others then changed := false;
  end;
  raise notice '% - fan CANNOT self-verify their phone number',
    case when changed then 'FAIL' else 'PASS' end;
end $$;

-- Loophole 8: content writes.
select pg_temp.must_fail('fan CANNOT create an artist',
  $$insert into public.artists (name, slug, install_code) values ('Fake','fake','X1')$$);

select pg_temp.must_fail('fan CANNOT create a reward for themselves',
  $$insert into public.reward_catalog (name, point_cost, unit_cost_cents, menu_value_cents)
    values ('Free everything', 0, 0, 999999)$$);

-- Loophole 15: client-supplied points.
select pg_temp.must_fail('fan CANNOT credit themselves points',
  $$insert into public.point_transactions (user_id, points, source_type)
    values ('00000000-0000-0000-0000-00000000a001', 100000, 'adjustment')$$);

select pg_temp.must_fail('fan CANNOT call award_points directly',
  $$select public.award_points('00000000-0000-0000-0000-00000000a001',
                               'referral_confirmed','referral','forged')$$);

select pg_temp.must_fail('fan CANNOT call issue_reward directly',
  $$select public.issue_reward('00000000-0000-0000-0000-00000000a001',
                               '00000000-0000-0000-0000-00000000ff03')$$);

select pg_temp.must_fail('fan CANNOT reach promote_to_admin',
  $$select public.promote_to_admin('fan-a@test.local')$$);

-- Loophole 30: ledger and audit immutability.
select pg_temp.must_fail('nobody can UPDATE the points ledger through the API',
  $$update public.point_transactions set points = 9999$$);

select pg_temp.must_fail('nobody can DELETE from the points ledger',
  $$delete from public.point_transactions$$);

select pg_temp.must_fail('nobody can INSERT into the audit log directly',
  $$insert into public.audit_log (action, entity_type) values ('forged','profiles')$$);

-- =========================================================================
-- Loophole 4: one artist reading another's engagement data.
-- =========================================================================
reset role;
insert into public.link_clicks (track_link_id, platform_code, opened_via) values
  ('00000000-0000-0000-0000-00000000dd01', 'spotify', 'native'),
  ('00000000-0000-0000-0000-00000000dd02', 'spotify', 'web');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}';

select pg_temp.report('artist reads clicks on their OWN track',
  (select count(*) = 1 from public.link_clicks
   where track_link_id = '00000000-0000-0000-0000-00000000dd01'));

select pg_temp.report('artist CANNOT read clicks on another artist''s track',
  (select count(*) = 0 from public.link_clicks
   where track_link_id = '00000000-0000-0000-0000-00000000dd02'));

-- =========================================================================
-- Loophole 6: a banned user keeps a valid JWT until it expires.
-- =========================================================================
reset role;
update public.profiles set is_banned = true, banned_at = now()
  where id = '00000000-0000-0000-0000-00000000a005';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a005","role":"authenticated"}';

select pg_temp.report('banned user loses their roles immediately',
  public.has_role('artist') = false);

select pg_temp.report('banned user CANNOT read Vault content',
  (select count(*) = 0 from public.exclusive_posts));

-- =========================================================================
-- Admin still works. A security model that blocks the operator is also broken.
-- =========================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a006","role":"authenticated"}';

select pg_temp.report('admin reads every profile',
  (select count(*) >= 6 from public.profiles));

select pg_temp.report('admin reads link_clicks',
  (select count(*) = 2 from public.link_clicks));

do $$
declare ok boolean := false;
begin
  begin
    insert into public.artists (name, slug, install_code) values ('New Signing','new-signing','INSTALL9');
    ok := true;
  exception when others then ok := false;
  end;
  raise notice '% - admin CAN create an artist', case when ok then 'PASS' else 'FAIL' end;
end $$;

reset role;
rollback;
