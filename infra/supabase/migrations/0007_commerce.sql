-- Partner businesses, offers, events and notifications.

create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  city_id       uuid not null references public.cities(id) on delete restrict,
  name          text not null,
  logo_url      text,
  category_id   uuid references public.business_categories(id) on delete set null,
  address       text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  tier          text not null default 'basic' check (tier in ('basic','featured','sponsor')),
  -- Where the post-redemption prompt sends people. Google only: Google permits
  -- asking customers for reviews, Yelp prohibits soliciting them at all.
  google_review_url text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint businesses_review_url_is_google check (
    google_review_url is null
    or google_review_url ~* '^https://(g\.page|search\.google\.com|www\.google\.com|maps\.app\.goo\.gl)/'
  )
);

create index if not exists businesses_city_idx on public.businesses (city_id) where is_active;

-- ---------------------------------------------------------------------------
create table if not exists public.offers (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  title           text not null,
  description     text,
  terms           text,
  starts_on       date not null default current_date,
  ends_on         date,
  redemption_type text not null default 'in_store_code'
                    check (redemption_type in ('in_store_code','link_out')),
  link_url        text,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_per_user    integer not null default 1 check (max_per_user > 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint offers_dates_sane check (ends_on is null or ends_on >= starts_on),
  constraint offers_link_needs_url
    check (redemption_type <> 'link_out' or link_url is not null)
);

create index if not exists offers_business_idx on public.offers (business_id) where is_active;

create table if not exists public.offer_redemptions (
  id          uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references public.offers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  staff_id    uuid references public.profiles(id) on delete set null,
  venue_id    uuid references public.venues(id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create index if not exists offer_redemptions_offer_idx on public.offer_redemptions (offer_id, redeemed_at desc);
create index if not exists offer_redemptions_user_idx  on public.offer_redemptions (user_id);

-- max_per_user is a per-offer setting, so the limit can't be a static unique
-- index. Enforce it where the row is written, under a lock on the offer.
create or replace function public.enforce_offer_limits()
returns trigger
language plpgsql
as $$
declare
  o          public.offers;
  user_count integer;
  total      integer;
begin
  select * into o from public.offers where id = new.offer_id for update;

  if o is null or not o.is_active then
    raise exception 'offer is not active';
  end if;
  if o.ends_on is not null and o.ends_on < current_date then
    raise exception 'offer has expired';
  end if;

  select count(*) into user_count from public.offer_redemptions
    where offer_id = new.offer_id and user_id = new.user_id;
  if user_count >= o.max_per_user then
    raise exception 'offer limit reached for this user';
  end if;

  if o.max_redemptions is not null then
    select count(*) into total from public.offer_redemptions where offer_id = new.offer_id;
    if total >= o.max_redemptions then
      raise exception 'offer fully redeemed';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists offer_redemptions_limits on public.offer_redemptions;
create trigger offer_redemptions_limits before insert on public.offer_redemptions
  for each row execute function public.enforce_offer_limits();

-- ---------------------------------------------------------------------------
-- Post-redemption review prompts.
--
-- The reward is earned for referring; the review request comes afterwards with
-- nothing attached to it. That separation is what keeps this permitted — an
-- incentive tied to the review itself would not be.
--
-- Two rules this table exists to enforce:
--
--   1. No sentiment gating. Every redeemer gets the same prompt. There is
--      deliberately no column for how the visit went, and none for whether a
--      review was left or what it said: filtering who gets asked by how happy
--      they are is exactly what Google prohibits, and data we do not hold
--      cannot be used that way later.
--   2. A frequency cap, so a regular is not asked every single visit.
create table if not exists public.review_prompts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  business_id  uuid references public.businesses(id) on delete cascade,
  venue_id     uuid references public.venues(id) on delete cascade,
  prompted_at  timestamptz not null default now(),
  dismissed_at timestamptz,
  opened_at    timestamptz,

  constraint review_prompts_has_target
    check (business_id is not null or venue_id is not null)
);

create index if not exists review_prompts_user_idx
  on public.review_prompts (user_id, prompted_at desc);

-- Whether a person is due another prompt. Default cooldown is 90 days; a
-- regular who comes in weekly should not be asked weekly.
create or replace function public.review_prompt_due(
  target_user     uuid,
  target_business uuid default null,
  target_venue    uuid default null,
  cooldown_days   integer default 90
)
returns boolean
language sql stable
as $$
  select not exists (
    select 1 from public.review_prompts
    where user_id = target_user
      and (target_business is null or business_id = target_business)
      and (target_venue    is null or venue_id    = target_venue)
      and prompted_at > now() - make_interval(days => cooldown_days)
  );
$$;

-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  title        text not null,
  description  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint events_times_sane check (ends_at is null or ends_at > starts_at)
);

create index if not exists events_upcoming_idx on public.events (starts_at) where is_published;

-- An event has a line-up, not one artist. A single artist_id column cannot
-- express a showcase, which is most of what a lounge actually runs.
create table if not exists public.event_artists (
  event_id      uuid not null references public.events(id) on delete cascade,
  artist_id     uuid not null references public.artists(id) on delete cascade,
  billing_order integer not null default 0,
  primary key (event_id, artist_id)
);

create table if not exists public.event_rsvps (
  event_id            uuid not null references public.events(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  attended_at         timestamptz,
  attended_scanned_by uuid references public.profiles(id) on delete set null,
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------------------
create table if not exists public.notification_campaigns (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  deep_link     text,
  segment       jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at       timestamptz,
  status        text not null default 'draft'
                  check (status in ('draft','scheduled','sending','sent','failed')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- One row per recipient. This is what lets you prove a targeted send reached
-- only the intended segment, rather than trusting the composer's filter.
create table if not exists public.notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.notification_campaigns(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  push_token_id uuid references public.push_tokens(id) on delete set null,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  opened_at     timestamptz,
  error         text,
  unique (campaign_id, user_id)
);

create index if not exists notification_deliveries_campaign_idx
  on public.notification_deliveries (campaign_id);
