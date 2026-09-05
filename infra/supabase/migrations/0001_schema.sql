-- Artist Hub — core schema
-- Phase 1: artists, tracks, profiles, link click tracking.
-- Later phases extend this file set; nothing here is app-specific hardcoded content.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('user', 'staff', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type link_platform as enum ('spotify', 'youtube', 'apple');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reward_type as enum ('hookah', 'wings');
exception when duplicate_object then null; end $$;

do $$ begin
  create type referral_status as enum ('pending', 'confirmed', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type business_tier as enum ('basic', 'featured', 'sponsor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type redemption_type as enum ('in_store_code', 'link_out');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text,
  contact       text,
  referral_code text unique not null,
  referred_by   uuid references public.profiles(id) on delete set null,
  role          user_role not null default 'user',
  city          text,
  push_token    text,
  is_banned     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists profiles_referral_code_idx on public.profiles (referral_code);
create index if not exists profiles_referred_by_idx  on public.profiles (referred_by);

-- ---------------------------------------------------------------------------
-- artists
-- ---------------------------------------------------------------------------
create table if not exists public.artists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  bio          text,
  photo_url    text,
  social_links jsonb not null default '{}'::jsonb,
  is_featured  boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists artists_sort_order_idx on public.artists (sort_order asc, created_at desc);
create index if not exists artists_featured_idx   on public.artists (is_featured) where is_featured;

-- ---------------------------------------------------------------------------
-- tracks
-- ---------------------------------------------------------------------------
create table if not exists public.tracks (
  id              uuid primary key default gen_random_uuid(),
  artist_id       uuid not null references public.artists(id) on delete cascade,
  title           text not null,
  cover_art_url   text,
  release_date    date,
  spotify_url     text,
  youtube_url     text,
  apple_music_url text,
  is_featured     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A track with no listen destination is useless in an app that only routes out.
  constraint tracks_needs_one_link check (
    coalesce(spotify_url, youtube_url, apple_music_url) is not null
  ),
  -- Store only well-formed https URLs; the admin UI validates too, but the DB is the backstop.
  constraint tracks_spotify_url_valid check (spotify_url is null or spotify_url ~* '^https://(open\.)?spotify\.com/'),
  constraint tracks_youtube_url_valid check (youtube_url is null or youtube_url ~* '^https://((www|m|music)\.)?youtube\.com/|^https://youtu\.be/'),
  constraint tracks_apple_url_valid   check (apple_music_url is null or apple_music_url ~* '^https://music\.apple\.com/')
);

create index if not exists tracks_artist_idx      on public.tracks (artist_id, release_date desc nulls last);
create index if not exists tracks_release_idx     on public.tracks (release_date desc nulls last);
create index if not exists tracks_featured_idx    on public.tracks (is_featured) where is_featured;

-- ---------------------------------------------------------------------------
-- link_clicks — the artist engagement report is built entirely on this table
-- ---------------------------------------------------------------------------
create table if not exists public.link_clicks (
  id         bigserial primary key,
  track_id   uuid not null references public.tracks(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  platform   link_platform not null,
  clicked_at timestamptz not null default now()
);

create index if not exists link_clicks_track_idx  on public.link_clicks (track_id, clicked_at desc);
create index if not exists link_clicks_time_idx   on public.link_clicks (clicked_at desc);
create index if not exists link_clicks_user_idx   on public.link_clicks (user_id);

-- ---------------------------------------------------------------------------
-- app_settings — reward thresholds etc. live here, never hardcoded in the app
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('reward_thresholds', '{"hookah": 3, "wings": 5}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists artists_touch_updated_at on public.artists;
create trigger artists_touch_updated_at before update on public.artists
  for each row execute function public.touch_updated_at();

drop trigger if exists tracks_touch_updated_at on public.tracks;
create trigger tracks_touch_updated_at before update on public.tracks
  for each row execute function public.touch_updated_at();
