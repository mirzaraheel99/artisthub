-- The redemption critical path.
--
-- This is the only flow where money leaves the business, and the only one where
-- a race condition costs real product. Everything here runs server-side with a
-- fixed search_path; the client supplies a code and nothing else.

-- ---------------------------------------------------------------------------
-- Operation receipts.
--
-- A committed redemption whose response never arrived is indistinguishable, to
-- the staff member holding the phone, from one somebody else already took.
-- Storing the result under a caller-supplied key makes a retry return the
-- original receipt instead of a bare refusal.
create table if not exists public.redemption_operations (
  id                  uuid primary key default gen_random_uuid(),
  staff_id            uuid not null references public.profiles(id) on delete cascade,
  operation_key       text not null,
  request_fingerprint text not null,
  grant_id            uuid references public.reward_grants(id) on delete set null,
  result              jsonb not null,
  created_at          timestamptz not null default now(),
  unique (staff_id, operation_key)
);

-- ---------------------------------------------------------------------------
-- Codes are short enough to read aloud across a loud room, and use the same
-- unambiguous alphabet as referral codes.
create or replace function public.generate_redemption_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  attempt   int := 0;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.reward_grants where redemption_code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'could not generate a unique redemption code';
    end if;
  end loop;
  return candidate;
end $$;

-- ---------------------------------------------------------------------------
-- Issue a reward. Enforces the monthly liability cap under concurrency by
-- locking the catalogue row before counting, so two simultaneous issues cannot
-- both read a count below the cap.
create or replace function public.issue_reward(target_user uuid, target_reward uuid)
returns public.reward_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  reward public.reward_catalog;
  issued integer;
  grant_row public.reward_grants;
begin
  select * into reward from public.reward_catalog
    where id = target_reward and is_active
    for update;                       -- serialises the cap check below

  -- `reward is null` would be wrong: on a composite it is only true when every
  -- field is null, so a found row with an optional column unset slips through.
  if not found then
    raise exception 'reward not found or inactive';
  end if;

  if exists (select 1 from public.profiles where id = target_user and is_banned) then
    raise exception 'user is banned';
  end if;

  if reward.monthly_issue_cap is not null then
    select count(*) into issued
    from public.reward_grants
    where reward_id = target_reward
      and granted_at >= date_trunc('month', now());

    if issued >= reward.monthly_issue_cap then
      raise exception 'monthly issue cap reached for reward %', reward.name;
    end if;
  end if;

  if not reward.is_repeatable then
    if exists (
      select 1 from public.reward_grants
      where user_id = target_user and reward_id = target_reward and voided_at is null
    ) then
      raise exception 'reward already issued to this user';
    end if;
  end if;

  insert into public.reward_grants (
    user_id, reward_id, redemption_code, expires_at,
    terms_reward_name, terms_requires_purchase, terms_blackout_rule_id,
    terms_max_per_visit, terms_unit_cost_cents, terms_menu_value_cents
  )
  values (
    target_user,
    target_reward,
    public.generate_redemption_code(),
    now() + make_interval(days => reward.validity_days),
    reward.name,
    reward.requires_purchase,
    reward.blackout_rule_id,
    reward.max_per_user_per_visit,
    reward.unit_cost_cents,
    reward.menu_value_cents
  )
  returning * into grant_row;

  return grant_row;
end $$;

-- ---------------------------------------------------------------------------
-- Redeem a code. Returns a structured result rather than raising, so the staff
-- screen can show a specific reason for every refusal.
create or replace function public.redeem_code(
  code            text,
  at_venue        uuid,
  purchase_made   boolean default false,
  operation_key   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_id      uuid := auth.uid();
  grant_row     public.reward_grants;
  is_welcome    boolean;
  redeemed_id   uuid;
  today_count   integer;
  business_date date;
  prior         public.redemption_operations;
  ref           public.referrals;
  result        jsonb;
begin
  if staff_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- A redemption can commit and the response can still be lost on the way back
  -- to a phone in a basement. Replaying the same operation key returns the
  -- original receipt, so staff can tell "I already did this" apart from
  -- "somebody else got here first" — which a bare already_redeemed cannot.
  if operation_key is not null then
    -- Both sides qualified: the local variable staff_id and the column of the
    -- same name would otherwise be ambiguous.
    select * into prior from public.redemption_operations o
      where o.staff_id = auth.uid()
        and o.operation_key = redeem_code.operation_key;

    if found then
      if prior.request_fingerprint is distinct from
         md5(upper(trim(code)) || ':' || at_venue::text) then
        return jsonb_build_object('ok', false, 'reason', 'operation_key_reused');
      end if;
      return prior.result || jsonb_build_object('replayed', true);
    end if;
  end if;

  -- Staff must be active at THIS venue. A Dallas partner's staff must not be
  -- able to redeem a Houston grant.
  if not exists (
    select 1 from public.venue_staff
    where user_id = staff_id and venue_id = at_venue and revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'staff_not_authorised_at_venue');
  end if;

  if exists (select 1 from public.profiles where id = staff_id and is_banned) then
    return jsonb_build_object('ok', false, 'reason', 'staff_banned');
  end if;

  -- Lock the grant before any further checks so two staff scanning the same
  -- screenshot at once serialise here rather than both proceeding.
  select * into grant_row from public.reward_grants
    where redemption_code = upper(trim(code))
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if grant_row.voided_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'voided');
  end if;

  if grant_row.redeemed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_redeemed',
                              'redeemed_at', grant_row.redeemed_at);
  end if;

  if grant_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired',
                              'expired_at', grant_row.expires_at);
  end if;

  if exists (select 1 from public.profiles where id = grant_row.user_id and is_banned) then
    return jsonb_build_object('ok', false, 'reason', 'user_banned');
  end if;

  -- Where the reward may be spent. Listing no venues means "anywhere active",
  -- which is only safe once a funder has been agreed for every venue.
  if exists (select 1 from public.reward_venues where reward_id = grant_row.reward_id)
     and not exists (
       select 1 from public.reward_venues
       where reward_id = grant_row.reward_id and venue_id = at_venue
     ) then
    return jsonb_build_object('ok', false, 'reason', 'not_valid_at_this_venue');
  end if;

  -- Terms come from the grant, not the catalogue: an admin editing a reward
  -- must not silently change what an outstanding promise means.
  if public.in_blackout(grant_row.terms_blackout_rule_id, at_venue, now()) then
    return jsonb_build_object('ok', false, 'reason', 'blackout_window');
  end if;

  if grant_row.terms_requires_purchase and not purchase_made then
    return jsonb_build_object('ok', false, 'reason', 'purchase_required');
  end if;

  business_date := public.venue_business_date(at_venue, now());

  -- Locking this grant does not lock a DIFFERENT grant belonging to the same
  -- fan, so two codes scanned at once would both count zero prior redemptions
  -- and both pass the per-visit limit. This advisory lock is held for the rest
  -- of the transaction and is keyed on the visit, not the grant, so every
  -- redemption for one person at one venue on one business day serialises here.
  perform pg_advisory_xact_lock(
    hashtextextended(grant_row.user_id::text || ':' || at_venue::text || ':' || business_date::text, 0)
  );

  select count(*) into today_count
  from public.reward_grants g
  where g.user_id = grant_row.user_id
    and g.redeemed_venue_id = at_venue
    and g.redeemed_at is not null
    and public.venue_business_date(at_venue, g.redeemed_at) = business_date;

  if today_count >= grant_row.terms_max_per_visit then
    return jsonb_build_object('ok', false, 'reason', 'visit_limit_reached');
  end if;

  -- The conditional UPDATE is the concurrency control. A read-then-write, or a
  -- check in application code, loses this race.
  update public.reward_grants
     set redeemed_at          = now(),
         redeemed_by_staff_id = staff_id,
         redeemed_venue_id    = at_venue
   where id = grant_row.id
     and redeemed_at is null
     and voided_at is null
     and expires_at > now()
  returning id into redeemed_id;

  if redeemed_id is null then
    return jsonb_build_object('ok', false, 'reason', 'already_redeemed');
  end if;

  -- Record the visit and award the check-in points, ignoring a second check-in
  -- on the same day.
  insert into public.venue_visits (user_id, venue_id, staff_id, visit_date)
  values (grant_row.user_id, at_venue, staff_id, business_date)
  on conflict do nothing;

  perform public.award_points(grant_row.user_id, 'venue_checkin', 'checkin',
                              grant_row.user_id::text || ':' || at_venue::text
                              || ':' || business_date::text);

  -- A redeemed welcome offer is what confirms a referral. This one flag is read
  -- live rather than bound, because it identifies which reward the campaign
  -- treats as its welcome offer rather than forming part of the fan's promise.
  select is_welcome_offer into is_welcome
    from public.reward_catalog where id = grant_row.reward_id;

  if coalesce(is_welcome, false) then
    select * into ref from public.referrals
      where referred_user_id = grant_row.user_id and status = 'pending'
      for update;

    -- `ref is not null` would be FALSE for every pending referral, because
    -- confirmed_at and confirming_redemption_id are null on one.
    if found then
      -- The most likely internal fraud is an employee confirming referrals for
      -- their own account. Refuse it here; the grant stays redeemed because the
      -- customer did receive the item.
      if ref.referrer_id = staff_id then
        insert into public.abuse_flags (user_id, flag_type, severity, detail)
        values (staff_id, 'staff_self_referral', 'high',
                jsonb_build_object('referral_id', ref.id, 'grant_id', grant_row.id));
      else
        update public.referrals
           set status = 'confirmed',
               confirmed_at = now(),
               confirming_redemption_id = grant_row.id
         where id = ref.id;

        perform public.award_points(ref.referrer_id, 'referral_confirmed',
                                    'referral', ref.id::text);
      end if;
    end if;
  end if;

  result := jsonb_build_object(
    'ok', true,
    'operation_id', gen_random_uuid(),
    'reward_name', grant_row.terms_reward_name,
    'requires_purchase', grant_row.terms_requires_purchase,
    'venue_id', at_venue,
    'staff_id', staff_id,
    'redeemed_at', now(),
    'user_id', grant_row.user_id
  );

  if operation_key is not null then
    insert into public.redemption_operations
      (staff_id, operation_key, request_fingerprint, grant_id, result)
    values (staff_id, operation_key,
            md5(upper(trim(code)) || ':' || at_venue::text),
            grant_row.id, result);
  end if;

  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Award points. The unique index on (source_type, source_id, rule_code) makes
-- this safe to call twice; the ON CONFLICT turns a retry into a no-op.
create or replace function public.award_points(
  target_user uuid,
  rule        text,
  src_type    text,
  src_id      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_points integer;
begin
  select points into rule_points from public.point_rules
    where code = rule and is_active;

  if rule_points is null then
    return;                          -- rule disabled; not an error
  end if;

  -- The conflict target must match point_tx_idempotent exactly, coalesce
  -- included: a null rule_code would otherwise never collide.
  insert into public.point_transactions (user_id, rule_code, points, source_type, source_id)
  values (target_user, rule, rule_points, src_type, src_id)
  on conflict (source_type, source_id, coalesce(rule_code, '-')) where source_id is not null
  do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Spend points. Locks the user's ledger rows so two simultaneous spends cannot
-- both see a sufficient balance — the classic double-spend against a derived
-- balance.
create or replace function public.spend_points(target_reward uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer     uuid := auth.uid();
  reward    public.reward_catalog;
  balance   integer;
  grant_row public.reward_grants;
begin
  if buyer is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into reward from public.reward_catalog where id = target_reward and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'reward_unavailable');
  end if;

  -- Serialise concurrent spends for this user.
  perform 1 from public.profiles where id = buyer for update;

  select public.points_balance(buyer) into balance;
  if balance < reward.point_cost then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_points',
                              'balance', balance, 'required', reward.point_cost);
  end if;

  insert into public.point_transactions (user_id, points, source_type, source_id, note)
  values (buyer, -reward.point_cost, 'reward_purchase',
          gen_random_uuid()::text, reward.name);

  grant_row := public.issue_reward(buyer, target_reward);

  return jsonb_build_object('ok', true, 'code', grant_row.redemption_code,
                            'expires_at', grant_row.expires_at);
end $$;
