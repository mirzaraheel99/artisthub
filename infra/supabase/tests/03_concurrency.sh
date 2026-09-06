#!/usr/bin/env bash
# Concurrency: BUILD-SPEC section 15, loopholes 10 and 18.
#
# These cannot be tested from a single psql session, because the whole point is
# what happens when two transactions overlap. Two staff scanning the same
# screenshot at the same moment is the realistic version of this, and it is the
# failure that costs real product.
#
# Run:  ./tests/03_concurrency.sh
# Override the client with:  PSQL="psql -h /var/run/postgresql -U postgres -d ah" ./tests/03_concurrency.sh
set -uo pipefail

PSQL=${PSQL:-"docker compose --project-directory ../stack exec -T db psql -U postgres -d postgres"}
FAILURES=0

report() {           # report <label> <ok|fail>
  if [[ "$2" == "ok" ]]; then
    echo "PASS - $1"
  else
    echo "FAIL - $1"
    FAILURES=$((FAILURES + 1))
  fi
}

# --------------------------------------------------------------------------
# Fixture. Committed, not rolled back, because two sessions must both see it.
# Everything is namespaced so it can be cleaned up at the end.
# --------------------------------------------------------------------------
$PSQL -q <<'SQL'
delete from public.point_transactions where note = 'concurrency-fixture';
delete from public.redemption_operations where grant_id in
  (select id from public.reward_grants where redemption_code in ('CONCUR01','CONCUR02'));
delete from public.reward_grants  where redemption_code in ('CONCUR01','CONCUR02');
delete from public.venue_staff    where user_id = '00000000-0000-0000-0000-0000000cc003';
delete from public.profiles       where id::text like '00000000-0000-0000-0000-0000000cc%';
delete from auth.users            where id::text like '00000000-0000-0000-0000-0000000cc%';
delete from public.reward_catalog where name in ('Concurrency Test Reward');
delete from public.venues         where name = 'Concurrency Test Venue';
delete from public.cities         where name = 'Concurrency Test City';

insert into public.cities (id, name, timezone)
values ('00000000-0000-0000-0000-0000000cc001', 'Concurrency Test City', 'America/Chicago');

insert into public.venues (id, city_id, name, timezone, is_owned)
values ('00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000cc001',
        'Concurrency Test Venue', 'America/Chicago', true);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000cc003', 'concur-staff@test.local'),
  ('00000000-0000-0000-0000-0000000cc004', 'concur-fan@test.local');

insert into public.user_roles (user_id, role_code)
values ('00000000-0000-0000-0000-0000000cc003', 'staff') on conflict do nothing;

insert into public.venue_staff (venue_id, user_id)
values ('00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000cc003');

insert into public.reward_catalog
  (id, name, point_cost, unit_cost_cents, menu_value_cents, requires_purchase, validity_days, is_repeatable)
values ('00000000-0000-0000-0000-0000000cc005', 'Concurrency Test Reward',
        100, 300, 1599, false, 90, true);

insert into public.reward_grants (
  user_id, reward_id, redemption_code, expires_at,
  terms_reward_name, terms_requires_purchase, terms_max_per_visit,
  terms_unit_cost_cents, terms_menu_value_cents)
values ('00000000-0000-0000-0000-0000000cc004', '00000000-0000-0000-0000-0000000cc005',
        'CONCUR01', now() + interval '30 days',
        'Concurrency Test Reward', false, 1, 300, 1599);

-- Exactly enough points for ONE purchase, so a double-spend would overdraw.
insert into public.point_transactions (user_id, points, source_type, source_id, note)
values ('00000000-0000-0000-0000-0000000cc004', 100, 'adjustment',
        'concurrency-fixture-seed', 'concurrency-fixture');
SQL

$PSQL -q <<'SQL'
-- Two grants, one fan, one venue, one night. Locking grant A does not lock
-- grant B, so without a visit-scoped lock both would pass the per-visit limit.
insert into public.reward_grants (
  user_id, reward_id, redemption_code, expires_at,
  terms_reward_name, terms_requires_purchase, terms_max_per_visit,
  terms_unit_cost_cents, terms_menu_value_cents)
values ('00000000-0000-0000-0000-0000000cc004', '00000000-0000-0000-0000-0000000cc005',
        'CONCUR02', now() + interval '30 days',
        'Concurrency Test Reward', false, 1, 300, 1599);
SQL

STAFF_JWT='{"sub":"00000000-0000-0000-0000-0000000cc003","role":"authenticated"}'
FAN_JWT='{"sub":"00000000-0000-0000-0000-0000000cc004","role":"authenticated"}'

# --------------------------------------------------------------------------
# Loophole 10: two staff scan the same code at the same instant.
#
# Session A takes the row lock and holds it for two seconds before committing.
# Session B starts while A is still open, blocks on the lock, and must then see
# the committed redemption rather than redeeming a second time.
# --------------------------------------------------------------------------
run_redeem() {       # run_redeem <hold_seconds> <outfile>
  $PSQL -tA -q > "$2" 2>&1 <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '$STAFF_JWT';
select public.redeem_code('CONCUR01', '00000000-0000-0000-0000-0000000cc002', true);
select pg_sleep($1);
commit;
SQL
}

A_OUT=$(mktemp); B_OUT=$(mktemp)
run_redeem 2 "$A_OUT" &
A_PID=$!
run_redeem 0 "$B_OUT" &
B_PID=$!
wait $A_PID $B_PID

OK_COUNT=$(cat "$A_OUT" "$B_OUT" | grep -c '"ok": true')
DUP_COUNT=$(cat "$A_OUT" "$B_OUT" | grep -c 'already_redeemed')

[[ "$OK_COUNT" -eq 1 ]] \
  && report "concurrent redemption of one code succeeds exactly once" ok \
  || report "concurrent redemption of one code succeeds exactly once (got $OK_COUNT successes)" fail

[[ "$DUP_COUNT" -eq 1 ]] \
  && report "the losing session is told the code was already redeemed" ok \
  || report "the losing session is told the code was already redeemed (got $DUP_COUNT)" fail

REDEEMED=$($PSQL -tA -c "select count(*) from public.reward_grants where redemption_code='CONCUR01' and redeemed_at is not null" | tr -d '[:space:]')
[[ "$REDEEMED" == "1" ]] \
  && report "the grant is marked redeemed exactly once in the database" ok \
  || report "the grant is marked redeemed exactly once in the database (got $REDEEMED)" fail

# --------------------------------------------------------------------------
# F04: two DIFFERENT grants redeemed for the same visit.
#
# The per-grant row lock does nothing here — the two requests touch different
# rows. Only a lock keyed on the visit stops both from reading zero prior
# redemptions and both passing a limit of one.
# --------------------------------------------------------------------------
redeem_named() {     # redeem_named <code> <outfile>
  $PSQL -tA -q > "$2" 2>&1 <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '$STAFF_JWT';
select public.redeem_code('$1', '00000000-0000-0000-0000-0000000cc002', true);
commit;
SQL
}

E_OUT=$(mktemp); F_OUT=$(mktemp)
redeem_named CONCUR02 "$E_OUT" &
redeem_named CONCUR02 "$F_OUT" &
wait

VISIT_REDEEMED=$($PSQL -tA -c "select count(*) from public.reward_grants where user_id='00000000-0000-0000-0000-0000000cc004' and redeemed_at is not null" | tr -d '[:space:]')
[[ "$VISIT_REDEEMED" -le 1 ]] \
  && report "the per-visit limit holds across different grants (redeemed $VISIT_REDEEMED)" ok \
  || report "the per-visit limit holds across different grants (redeemed $VISIT_REDEEMED)" fail

rm -f "$E_OUT" "$F_OUT"

# --------------------------------------------------------------------------
# Loophole 18: double-spend against a derived balance.
#
# The balance is sum(point_transactions), so two overlapping spends could both
# read a sufficient balance unless spend_points serialises them.
# --------------------------------------------------------------------------
run_spend() {        # run_spend <outfile>
  $PSQL -tA -q > "$1" 2>&1 <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '$FAN_JWT';
select public.spend_points('00000000-0000-0000-0000-0000000cc005');
commit;
SQL
}

C_OUT=$(mktemp); D_OUT=$(mktemp)
run_spend "$C_OUT" &
run_spend "$D_OUT" &
wait

BALANCE=$($PSQL -tA -c "select public.points_balance('00000000-0000-0000-0000-0000000cc004')" | tr -d '[:space:]')
[[ "$BALANCE" -ge 0 ]] \
  && report "concurrent point spends cannot overdraw the balance (ended at $BALANCE)" ok \
  || report "concurrent point spends cannot overdraw the balance (ended at $BALANCE)" fail

SPENDS=$($PSQL -tA -c "select count(*) from public.point_transactions where user_id='00000000-0000-0000-0000-0000000cc004' and source_type='reward_purchase'" | tr -d '[:space:]')
[[ "$SPENDS" -eq 1 ]] \
  && report "exactly one spend was recorded" ok \
  || report "exactly one spend was recorded (got $SPENDS)" fail

# --------------------------------------------------------------------------
$PSQL -q <<'SQL'
delete from public.point_transactions where user_id = '00000000-0000-0000-0000-0000000cc004';
delete from public.reward_grants  where user_id = '00000000-0000-0000-0000-0000000cc004';
delete from public.venue_staff    where user_id = '00000000-0000-0000-0000-0000000cc003';
delete from public.venue_visits   where user_id = '00000000-0000-0000-0000-0000000cc004';
delete from public.user_roles     where user_id in ('00000000-0000-0000-0000-0000000cc003','00000000-0000-0000-0000-0000000cc004');
delete from public.profiles       where id in ('00000000-0000-0000-0000-0000000cc003','00000000-0000-0000-0000-0000000cc004');
delete from auth.users            where id in ('00000000-0000-0000-0000-0000000cc003','00000000-0000-0000-0000-0000000cc004');
delete from public.reward_catalog where id = '00000000-0000-0000-0000-0000000cc005';
delete from public.venues         where id = '00000000-0000-0000-0000-0000000cc002';
delete from public.cities         where id = '00000000-0000-0000-0000-0000000cc001';
SQL

rm -f "$A_OUT" "$B_OUT" "$C_OUT" "$D_OUT"
echo
if [[ "$FAILURES" -eq 0 ]]; then
  echo "All concurrency checks passed."
else
  echo "$FAILURES concurrency check(s) FAILED."
  exit 1
fi
