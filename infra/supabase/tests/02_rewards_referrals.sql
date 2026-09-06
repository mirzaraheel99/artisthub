-- Rewards, redemption and referrals: BUILD-SPEC section 15, "Economic" and
-- "Referral". Concurrency is covered separately in tests/03_concurrency.sh,
-- which needs two real sessions.
--
-- Run:  ./scripts/psql.sh -f tests/02_rewards_referrals.sql
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

-- fan-b was referred by fan-a.
update public.profiles set referred_by = '00000000-0000-0000-0000-00000000a001'
  where id = '00000000-0000-0000-0000-00000000a002';
insert into public.referrals (referrer_id, referred_user_id, status)
values ('00000000-0000-0000-0000-00000000a001',
        '00000000-0000-0000-0000-00000000a002', 'pending')
on conflict do nothing;

-- =========================================================================
-- Referral integrity
-- =========================================================================
select pg_temp.must_fail('a user cannot refer themselves',
  $$insert into public.referrals (referrer_id, referred_user_id)
    values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a001')$$);

select pg_temp.must_fail('a user cannot be referred twice, by anyone',
  $$insert into public.referrals (referrer_id, referred_user_id)
    values ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000a002')$$);

-- The confirmation must point at the redemption that caused it, so a referral
-- confirmed without a real visit cannot even be represented.
select pg_temp.must_fail('a referral cannot be confirmed without a redemption',
  $$update public.referrals set status = 'confirmed', confirmed_at = now()
    where referred_user_id = '00000000-0000-0000-0000-00000000a002'$$);

-- =========================================================================
-- Issuing
-- =========================================================================
do $$
declare g public.reward_grants;
begin
  g := public.issue_reward('00000000-0000-0000-0000-00000000a002',
                           '00000000-0000-0000-0000-00000000ff01');
  raise notice '% - a welcome offer issues with a code and an expiry',
    case when g.redemption_code is not null and g.expires_at > now() then 'PASS' else 'FAIL' end;
end $$;

select pg_temp.report('expiry honours the reward''s validity_days',
  (select expires_at::date = (now() + interval '30 days')::date
   from public.reward_grants
   where user_id = '00000000-0000-0000-0000-00000000a002'));

select pg_temp.must_fail('a non-repeatable reward cannot be issued twice',
  $$select public.issue_reward('00000000-0000-0000-0000-00000000a002',
                               '00000000-0000-0000-0000-00000000ff01')$$);

-- Monthly liability cap.
update public.reward_catalog set monthly_issue_cap = 1
  where id = '00000000-0000-0000-0000-00000000ff02';
select public.issue_reward('00000000-0000-0000-0000-00000000a001',
                           '00000000-0000-0000-0000-00000000ff02');
select pg_temp.must_fail('the monthly issue cap is enforced',
  $$select public.issue_reward('00000000-0000-0000-0000-00000000a003',
                               '00000000-0000-0000-0000-00000000ff02')$$);
update public.reward_catalog set monthly_issue_cap = null
  where id = '00000000-0000-0000-0000-00000000ff02';

-- =========================================================================
-- Redemption, as staff
--
-- Staff cannot read reward_grants (proved in 01_access_control), so the code is
-- captured here first. That mirrors reality: the code reaches staff by scanning
-- the fan's screen, never by querying the table.
-- =========================================================================
create temp table pg_temp_codes as
  select user_id, redemption_code from public.reward_grants;
grant select on pg_temp_codes to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}';

-- requires_purchase: the guardrail that turns a giveaway into a discount.
do $$
declare code text; r jsonb;
begin
  select redemption_code into code from pg_temp_codes
    where user_id = '00000000-0000-0000-0000-00000000a002';
  r := public.redeem_code(code, '00000000-0000-0000-0000-00000000e001', false);
  raise notice '% - redemption is refused when a purchase is required but not made (%)',
    case when (r->>'ok')::boolean = false and r->>'reason' = 'purchase_required'
         then 'PASS' else 'FAIL' end, r->>'reason';
end $$;

-- Staff scoped to their own venue: a Dallas partner must not redeem a Houston grant.
do $$
declare code text; r jsonb;
begin
  select redemption_code into code from pg_temp_codes
    where user_id = '00000000-0000-0000-0000-00000000a002';
  r := public.redeem_code(code, '00000000-0000-0000-0000-00000000e002', true);
  raise notice '% - staff cannot redeem at a venue they are not assigned to (%)',
    case when r->>'reason' = 'staff_not_authorised_at_venue' then 'PASS' else 'FAIL' end,
    r->>'reason';
end $$;

select pg_temp.report('an unknown code is refused',
  (public.redeem_code('NOTACODE', '00000000-0000-0000-0000-00000000e001', true) ->> 'reason')
    = 'not_found');

-- The successful path, which must also confirm the referral.
do $$
declare code text; r jsonb;
begin
  select redemption_code into code from pg_temp_codes
    where user_id = '00000000-0000-0000-0000-00000000a002';
  r := public.redeem_code(code, '00000000-0000-0000-0000-00000000e001', true);
  raise notice '% - a valid welcome offer redeems (%)',
    case when (r->>'ok')::boolean then 'PASS' else 'FAIL' end, coalesce(r->>'reason','ok');
end $$;

-- Loophole 10, sequential half. The concurrent half is in 03_concurrency.sh.
do $$
declare code text; r jsonb;
begin
  select redemption_code into code from pg_temp_codes
    where user_id = '00000000-0000-0000-0000-00000000a002';
  r := public.redeem_code(code, '00000000-0000-0000-0000-00000000e001', true);
  raise notice '% - the same code cannot be redeemed twice (%)',
    case when r->>'reason' = 'already_redeemed' then 'PASS' else 'FAIL' end, r->>'reason';
end $$;

reset role;

select pg_temp.report('redeeming the welcome offer confirmed the referral',
  (select status = 'confirmed' and confirming_redemption_id is not null
   from public.referrals where referred_user_id = '00000000-0000-0000-0000-00000000a002'));

select pg_temp.report('the referrer was credited referral points',
  public.points_balance('00000000-0000-0000-0000-00000000a001') >= 100);

select pg_temp.report('the redemption recorded which staff member scanned it',
  (select redeemed_by_staff_id = '00000000-0000-0000-0000-00000000a003'
   from public.reward_grants where user_id = '00000000-0000-0000-0000-00000000a002'));

select pg_temp.report('a visit was recorded for the redeeming fan',
  (select count(*) = 1 from public.venue_visits
   where user_id = '00000000-0000-0000-0000-00000000a002'));

-- Idempotency: replaying an award must not credit twice.
do $$
declare before_pts integer; after_pts integer; ref_id uuid;
begin
  select id into ref_id from public.referrals
    where referred_user_id = '00000000-0000-0000-0000-00000000a002';
  before_pts := public.points_balance('00000000-0000-0000-0000-00000000a001');
  perform public.award_points('00000000-0000-0000-0000-00000000a001',
                              'referral_confirmed', 'referral', ref_id::text);
  after_pts := public.points_balance('00000000-0000-0000-0000-00000000a001');
  raise notice '% - a replayed point award does not credit twice',
    case when before_pts = after_pts then 'PASS' else 'FAIL' end;
end $$;

-- =========================================================================
-- Expiry and voiding
-- =========================================================================
do $$
declare g public.reward_grants; r jsonb;
begin
  g := public.issue_reward('00000000-0000-0000-0000-00000000a001',
                           '00000000-0000-0000-0000-00000000ff02');
  update public.reward_grants set expires_at = now() - interval '1 day' where id = g.id;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000a003","role":"authenticated"}', true);
  r := public.redeem_code(g.redemption_code, '00000000-0000-0000-0000-00000000e001', true);
  raise notice '% - an expired grant is refused (%)',
    case when r->>'reason' = 'expired' then 'PASS' else 'FAIL' end, r->>'reason';
end $$;

do $$
declare g public.reward_grants; r jsonb;
begin
  g := public.issue_reward('00000000-0000-0000-0000-00000000a004',
                           '00000000-0000-0000-0000-00000000ff02');
  update public.reward_grants set voided_at = now(), void_reason = 'test' where id = g.id;
  r := public.redeem_code(g.redemption_code, '00000000-0000-0000-0000-00000000e001', true);
  raise notice '% - a voided grant is refused (%)',
    case when r->>'reason' = 'voided' then 'PASS' else 'FAIL' end, r->>'reason';
end $$;

select pg_temp.must_fail('a grant cannot be both redeemed and voided',
  $$update public.reward_grants
      set redeemed_at = now(), redeemed_by_staff_id = '00000000-0000-0000-0000-00000000a003',
          voided_at = now()
    where user_id = '00000000-0000-0000-0000-00000000a001'$$);

-- =========================================================================
-- Blackout, evaluated in the venue's timezone
-- =========================================================================
select pg_temp.report('Friday 21:00 Houston time falls inside the blackout',
  public.in_blackout((select id from public.blackout_rules limit 1),
                     '00000000-0000-0000-0000-00000000e001',
                     '2026-09-04 21:00:00 America/Chicago'::timestamptz));

select pg_temp.report('Tuesday 21:00 is outside the blackout',
  public.in_blackout((select id from public.blackout_rules limit 1),
                     '00000000-0000-0000-0000-00000000e001',
                     '2026-09-01 21:00:00 America/Chicago'::timestamptz) = false);

select pg_temp.report('Saturday 01:00 is still inside Friday night''s window',
  public.in_blackout((select id from public.blackout_rules limit 1),
                     '00000000-0000-0000-0000-00000000e001',
                     '2026-09-05 01:00:00 America/Chicago'::timestamptz));

-- Loophole 12: the device clock is irrelevant because the venue's timezone
-- decides. 21:00 in Houston is 02:00 UTC, which would read as outside a
-- naive UTC comparison.
select pg_temp.report('blackout uses the venue timezone, not UTC',
  public.in_blackout((select id from public.blackout_rules limit 1),
                     '00000000-0000-0000-0000-00000000e001',
                     '2026-09-05 02:00:00+00'::timestamptz));

-- =========================================================================
-- Points spending
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';

select pg_temp.report('spending more points than you hold is refused',
  (public.spend_points('00000000-0000-0000-0000-00000000ff03') ->> 'reason')
    = 'insufficient_points');

reset role;
rollback;
