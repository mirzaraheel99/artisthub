-- The redemption critical path.
--
-- This is the only flow where money leaves the business, and the only one where
-- a race condition costs real product. Everything here runs server-side with a
-- fixed search_path; the client supplies a code and nothing else.

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

  insert into public.reward_grants (user_id, reward_id, redemption_code, expires_at)
  values (
    target_user,
    target_reward,
    public.generate_redemption_code(),
    now() + make_interval(days => reward.validity_days)
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
  purchase_made   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_id     uuid := auth.uid();
  grant_row    public.reward_grants;
  reward       public.reward_catalog;
  redeemed_id  uuid;
  today_count  integer;
  ref          public.referrals;
begin
  if staff_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
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

  select * into reward from public.reward_catalog where id = grant_row.reward_id;

  if public.in_blackout(reward.blackout_rule_id, at_venue, now()) then
    return jsonb_build_object('ok', false, 'reason', 'blackout_window');
  end if;

  if reward.requires_purchase and not purchase_made then
    return jsonb_build_object('ok', false, 'reason', 'purchase_required');
  end if;

  select count(*) into today_count
  from public.reward_grants g
  where g.user_id = grant_row.user_id
    and g.redeemed_venue_id = at_venue
    and g.redeemed_at::date = (now() at time zone 'UTC')::date;

  if today_count >= reward.max_per_user_per_visit then
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
  insert into public.venue_visits (user_id, venue_id, staff_id)
  values (grant_row.user_id, at_venue, staff_id)
  on conflict do nothing;

  perform public.award_points(grant_row.user_id, 'venue_checkin', 'checkin',
                              grant_row.user_id::text || ':' || (now() at time zone 'UTC')::date::text);

  -- A redeemed welcome offer is what confirms a referral.
  if reward.is_welcome_offer then
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

  return jsonb_build_object(
    'ok', true,
    'reward_name', reward.name,
    'requires_purchase', reward.requires_purchase,
    'user_id', grant_row.user_id
  );
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

  insert into public.point_transactions (user_id, rule_code, points, source_type, source_id)
  values (target_user, rule, rule_points, src_type, src_id)
  on conflict (source_type, source_id, rule_code) where source_id is not null
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
