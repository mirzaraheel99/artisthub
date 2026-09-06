-- Points, rewards and referrals: everywhere money leaves the business.

-- ---------------------------------------------------------------------------
-- Earn rates, editable by an admin without an app release.
create table if not exists public.point_rules (
  code        text primary key,
  description text not null,
  points      integer not null,
  daily_cap   integer,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);

insert into public.point_rules (code, description, points, daily_cap) values
  ('referral_confirmed', 'A referred friend redeemed their welcome offer', 100, null),
  ('venue_checkin',      'Checked in at a venue',                           25,   1),
  ('event_attended',     'Attended an event they RSVP''d to',               40,   1),
  ('birthday',           'Birthday reward',                                 50,   1),
  ('monthly_streak',     'Four visits in a calendar month',                 75,   1)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- The ledger. Append only: no UPDATE, no DELETE (grants withheld in 0009).
--
-- Balance is always sum(points), never a stored counter. A stored balance
-- drifts under concurrency and cannot be audited after the fact; a mistake here
-- is corrected by inserting a compensating row, which preserves the history.
create table if not exists public.point_transactions (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rule_code   text references public.point_rules(code),
  points      integer not null,
  source_type text not null check (source_type in
                ('referral','checkin','event','reward_purchase','adjustment','reversal','birthday','streak')),
  source_id   text,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists point_tx_user_idx on public.point_transactions (user_id, created_at desc);

-- Idempotency. An award call retried after a timeout must not credit twice.
--
-- rule_code is nullable (a spend or a manual adjustment has no rule), and an
-- ordinary unique index treats NULLs as distinct — so two identical null-rule
-- rows would both be accepted and the key would silently do nothing. coalesce
-- gives every row a concrete value to collide on.
create unique index if not exists point_tx_idempotent
  on public.point_transactions (source_type, source_id, coalesce(rule_code, '-'))
  where source_id is not null;

-- Every ledger row must be attributable to something. Without this, a caller
-- can sidestep the key above simply by omitting source_id.
alter table public.point_transactions
  drop constraint if exists point_tx_needs_source;
alter table public.point_transactions
  add constraint point_tx_needs_source check (source_id is not null);

create or replace function public.points_balance(target uuid)
returns integer
language sql stable
as $$
  select coalesce(sum(points), 0)::integer
  from public.point_transactions where user_id = target;
$$;

-- ---------------------------------------------------------------------------
-- Blackout windows, so rewards land on slow nights instead of discounting the
-- busiest ones. weekday_mask is a bitmask: Mon=1, Tue=2, Wed=4 … Sun=64.
create table if not exists public.blackout_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  weekday_mask integer not null check (weekday_mask between 0 and 127),
  start_time   time not null,
  end_time     time not null,
  is_active    boolean not null default true
);

insert into public.blackout_rules (name, weekday_mask, start_time, end_time)
select 'Weekend prime hours', 16 + 32, '20:00', '02:00'   -- Fri (16) + Sat (32)
where not exists (select 1 from public.blackout_rules);

-- Evaluated in the VENUE's timezone, never the device's. A phone whose clock or
-- timezone has been changed must not be able to redeem inside a blackout.
create or replace function public.in_blackout(rule_id uuid, venue_id uuid, at_time timestamptz)
returns boolean
language plpgsql stable
as $$
declare
  r        public.blackout_rules;
  tz       text;
  local_ts timestamp;
  dow_bit  integer;
  t        time;
begin
  if rule_id is null then return false; end if;

  select * into r from public.blackout_rules where id = rule_id and is_active;
  -- FOUND, not `r is null`: on a composite the latter is only true when every
  -- field is null, so a real row with any optional column would slip past it.
  if not found then return false; end if;

  select timezone into tz from public.venues where id = venue_id;
  if tz is null then tz := 'America/Chicago'; end if;

  local_ts := at_time at time zone tz;
  t := local_ts::time;

  -- isodow: Mon=1 … Sun=7, so the bit for a day is 2^(isodow-1).
  dow_bit := (1 << (extract(isodow from local_ts)::int - 1));

  if r.start_time <= r.end_time then
    return (r.weekday_mask & dow_bit) <> 0 and t >= r.start_time and t < r.end_time;
  else
    -- Window crosses midnight (e.g. 20:00–02:00). The late-night portion still
    -- belongs to the evening that started it, so the previous day's bit applies.
    if t >= r.start_time then
      return (r.weekday_mask & dow_bit) <> 0;
    elsif t < r.end_time then
      return (r.weekday_mask & (1 << ((extract(isodow from local_ts)::int + 5) % 7))) <> 0;
    end if;
    return false;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The reward catalogue.
--
-- unit_cost_cents and menu_value_cents are separate deliberately: the fan sees
-- the menu value, the cost-exposure report uses the real cost.
create table if not exists public.reward_catalog (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  description            text,
  point_cost             integer not null check (point_cost >= 0),
  referral_threshold     integer,
  unit_cost_cents        integer not null check (unit_cost_cents >= 0),
  menu_value_cents       integer not null check (menu_value_cents >= 0),
  requires_purchase      boolean not null default true,
  blackout_rule_id       uuid references public.blackout_rules(id) on delete set null,
  validity_days          integer not null default 90 check (validity_days > 0),
  monthly_issue_cap      integer check (monthly_issue_cap is null or monthly_issue_cap > 0),
  max_per_user_per_visit integer not null default 1 check (max_per_user_per_visit > 0),
  is_welcome_offer       boolean not null default false,
  is_repeatable          boolean not null default false,
  is_active              boolean not null default true,
  sort_order             integer not null default 0
);

-- Exactly one welcome offer can be live: it is what confirms a referral, so an
-- ambiguous second one would make attribution undefined.
create unique index if not exists reward_catalog_one_welcome
  on public.reward_catalog ((true)) where is_welcome_offer and is_active;

-- ---------------------------------------------------------------------------
-- Where a reward may be redeemed.
--
-- Recording the venue after the fact does not restrict anything: without this,
-- any active staff member at any venue can redeem any grant, so a Houston
-- benefit funded by the label is spendable at a Dallas partner who never
-- agreed to fund it. No rows for a reward means "the venues listed below",
-- which for the pilot is the owned Houston venue only.
create table if not exists public.reward_venues (
  reward_id uuid not null references public.reward_catalog(id) on delete cascade,
  venue_id  uuid not null references public.venues(id) on delete cascade,
  primary key (reward_id, venue_id)
);

-- ---------------------------------------------------------------------------
create table if not exists public.reward_grants (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  reward_id            uuid not null references public.reward_catalog(id) on delete restrict,
  redemption_code      text not null unique,
  granted_at           timestamptz not null default now(),
  expires_at           timestamptz not null,

  -- Terms are copied from the catalogue at issuance and read from here at
  -- redemption. A grant is a promise already made: editing the catalogue must
  -- change what is issued next, never what was already handed to a fan.
  terms_reward_name        text    not null,
  terms_requires_purchase  boolean not null,
  terms_blackout_rule_id   uuid    references public.blackout_rules(id) on delete set null,
  terms_max_per_visit      integer not null default 1,
  terms_unit_cost_cents    integer not null default 0,
  terms_menu_value_cents   integer not null default 0,
  redeemed_at          timestamptz,
  redeemed_venue_id    uuid references public.venues(id) on delete set null,
  redeemed_by_staff_id uuid references public.profiles(id) on delete set null,
  voided_at            timestamptz,
  void_reason          text,
  voided_by            uuid references public.profiles(id) on delete set null,

  constraint reward_grants_not_both check (redeemed_at is null or voided_at is null),
  constraint reward_grants_redeemed_has_staff
    check (redeemed_at is null or redeemed_by_staff_id is not null)
);

create index if not exists reward_grants_user_idx on public.reward_grants (user_id, granted_at desc);
create index if not exists reward_grants_open_idx
  on public.reward_grants (expires_at) where redeemed_at is null and voided_at is null;
create index if not exists reward_grants_staff_idx
  on public.reward_grants (redeemed_by_staff_id, redeemed_at desc) where redeemed_at is not null;

-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id                       uuid primary key default gen_random_uuid(),
  referrer_id              uuid not null references public.profiles(id) on delete cascade,
  referred_user_id         uuid not null references public.profiles(id) on delete cascade,
  status                   text not null default 'pending'
                             check (status in ('pending','confirmed','rejected')),
  created_at               timestamptz not null default now(),
  confirmed_at             timestamptz,
  confirming_redemption_id uuid references public.reward_grants(id) on delete set null,
  rejected_reason          text,

  -- A person can be referred exactly once, ever. Without this, deleting and
  -- re-creating an account lets the same person be farmed repeatedly.
  constraint referrals_one_per_referred unique (referred_user_id),
  constraint referrals_no_self check (referrer_id <> referred_user_id),
  -- A confirmation must point at the redemption that caused it. This is what
  -- makes "confirmed without a real visit" impossible to represent.
  constraint referrals_confirmed_needs_proof
    check (status <> 'confirmed' or confirming_redemption_id is not null)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, status);

-- Now that referrals exists, the signup trigger can create the pending row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_id  uuid;
  claimed_code text;
begin
  claimed_code := nullif(upper(trim(new.raw_user_meta_data ->> 'referral_code')), '');

  if claimed_code is not null then
    select id into referrer_id
    from public.profiles
    where referral_code = claimed_code and is_banned = false;
  end if;

  insert into public.profiles (id, display_name, email, phone_e164, referral_code, referred_by)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    new.email,
    new.phone,
    public.generate_referral_code(),
    referrer_id
  )
  on conflict (id) do nothing;

  -- Everyone starts as a fan. Role is never read from signup metadata: a client
  -- that could name its own role could name 'admin'.
  insert into public.user_roles (user_id, role_code)
  values (new.id, 'fan')
  on conflict do nothing;

  -- Pending only. Confirmation requires a redeemed welcome offer (see 0006).
  if referrer_id is not null then
    insert into public.referrals (referrer_id, referred_user_id, status)
    values (referrer_id, new.id, 'pending')
    on conflict (referred_user_id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
