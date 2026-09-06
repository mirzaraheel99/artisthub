-- Roster, catalogue, outbound links and exclusive content.

create table if not exists public.artists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  bio          text,
  photo_url    text,
  city_id      uuid references public.cities(id) on delete set null,
  install_code text not null unique,
  is_featured  boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- install_code gives each artist their own trackable install link. An artist
-- with a following drives more installs in an hour than fan-to-fan referral
-- does in a month, and this is what proves which artists actually deliver.
create index if not exists artists_sort_idx     on public.artists (sort_order, created_at desc) where is_active;
create index if not exists artists_featured_idx on public.artists (is_featured) where is_featured and is_active;

drop trigger if exists artists_touch on public.artists;
create trigger artists_touch before update on public.artists
  for each row execute function public.touch_updated_at();

-- Links a signed artist to the login that reads their dashboard. Many-to-many
-- because a duo or group has more than one member.
create table if not exists public.artist_members (
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (artist_id, user_id)
);

create index if not exists artist_members_user_idx on public.artist_members (user_id);

-- ---------------------------------------------------------------------------
create table if not exists public.artist_links (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null references public.artists(id) on delete cascade,
  platform_code  text not null references public.link_platforms(code),
  url            text not null,
  unique (artist_id, platform_code)
);

create table if not exists public.artist_socials (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null references public.artists(id) on delete cascade,
  platform_code  text not null references public.social_platforms(code),
  url            text not null,
  unique (artist_id, platform_code)
);

-- ---------------------------------------------------------------------------
create table if not exists public.tracks (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references public.artists(id) on delete cascade,
  title         text not null,
  cover_art_url text,
  release_date  date,
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tracks_artist_idx   on public.tracks (artist_id, release_date desc nulls last);
create index if not exists tracks_release_idx  on public.tracks (release_date desc nulls last) where is_active;
create index if not exists tracks_featured_idx on public.tracks (is_featured) where is_featured and is_active;

drop trigger if exists tracks_touch on public.tracks;
create trigger tracks_touch before update on public.tracks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- One row per destination rather than three columns on tracks. Adding a fourth
-- platform is then a row in link_platforms, not a schema migration and a
-- redeploy of both clients.
create table if not exists public.track_links (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.tracks(id) on delete cascade,
  platform_code text not null references public.link_platforms(code),
  url           text not null,
  created_at    timestamptz not null default now(),
  unique (track_id, platform_code)
);

create index if not exists track_links_track_idx on public.track_links (track_id);

-- The URL must match the platform it claims to be. Without this an admin who
-- pastes a YouTube link into the Spotify field makes the app build a native
-- link that opens the wrong app, and the failure is silent.
create or replace function public.validate_platform_url()
returns trigger
language plpgsql
as $$
declare
  pattern text;
begin
  select url_pattern into pattern from public.link_platforms where code = new.platform_code;
  if pattern is null then
    raise exception 'unknown platform %', new.platform_code;
  end if;
  if new.url !~* pattern then
    raise exception 'URL % is not a valid % link', new.url, new.platform_code;
  end if;
  return new;
end $$;

drop trigger if exists track_links_validate on public.track_links;
create trigger track_links_validate before insert or update on public.track_links
  for each row execute function public.validate_platform_url();

drop trigger if exists artist_links_validate on public.artist_links;
create trigger artist_links_validate before insert or update on public.artist_links
  for each row execute function public.validate_platform_url();

-- A track with no destination does nothing in an app that only routes out.
-- Deferred so a track and its first link can be inserted in one transaction.
create or replace function public.assert_track_has_link()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.track_links where track_id = new.id) then
    raise exception 'track % has no streaming link', new.id;
  end if;
  return new;
end $$;

drop trigger if exists tracks_require_link on public.tracks;
create constraint trigger tracks_require_link
  after insert on public.tracks
  deferrable initially deferred
  for each row execute function public.assert_track_has_link();

-- ---------------------------------------------------------------------------
-- Every outbound tap. opened_via is what proves in production whether fans
-- reach the real app or fall back to a web player.
create table if not exists public.link_clicks (
  id            bigserial primary key,
  track_link_id uuid not null references public.track_links(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  device_id     uuid references public.devices(id) on delete set null,
  platform_code text not null references public.link_platforms(code),
  city_id       uuid references public.cities(id) on delete set null,
  opened_via    text not null check (opened_via in ('native','web','failed')),
  clicked_at    timestamptz not null default now()
);

create index if not exists link_clicks_link_idx on public.link_clicks (track_link_id, clicked_at desc);
create index if not exists link_clicks_time_idx on public.link_clicks (clicked_at desc);
create index if not exists link_clicks_user_idx on public.link_clicks (user_id);

-- ---------------------------------------------------------------------------
-- The Vault: label-owned exclusive material that exists nowhere else and
-- carries no streaming link. This is the retention engine — a reward gets an
-- install, content this good gets a weekly open.
create table if not exists public.exclusive_posts (
  id         uuid primary key default gen_random_uuid(),
  artist_id  uuid references public.artists(id) on delete cascade,
  title      text not null,
  body       text,
  media_url  text,
  media_type text check (media_type in ('audio','video','image')),
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists exclusive_posts_live_idx
  on public.exclusive_posts (publish_at desc);

create table if not exists public.exclusive_post_views (
  post_id         uuid not null references public.exclusive_posts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
