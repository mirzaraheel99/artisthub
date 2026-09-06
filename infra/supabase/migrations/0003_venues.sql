-- Venues and staff.
--
-- Multi-city works because a venue can be owned or partnered. In Houston the
-- label funds the rewards from its own lounge; in Dallas or Atlanta a partner
-- venue funds them in exchange for the footfall. Same mechanics, different
-- funder, no schema change on expansion.

create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references public.cities(id) on delete restrict,
  name       text not null,
  address    text,
  timezone   text not null default 'America/Chicago',
  is_owned   boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists venues_city_idx on public.venues (city_id) where is_active;

-- ---------------------------------------------------------------------------
-- Staff permissions are scoped to a venue, never global. A partner venue's
-- staff in Dallas must not be able to redeem a Houston grant.
create table if not exists public.venue_staff (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists venue_staff_active_unique
  on public.venue_staff (venue_id, user_id) where revoked_at is null;
create index if not exists venue_staff_user_idx
  on public.venue_staff (user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Check-ins. One per person per venue per day: a fan who steps outside and
-- comes back has not made a second visit.
create table if not exists public.venue_visits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  staff_id      uuid references public.profiles(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  visit_date    date not null default (now() at time zone 'UTC')::date
);

create unique index if not exists venue_visits_one_per_day
  on public.venue_visits (user_id, venue_id, visit_date);
create index if not exists venue_visits_venue_idx
  on public.venue_visits (venue_id, checked_in_at desc);
