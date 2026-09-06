-- Reference data.
--
-- These are tables rather than enums or free text because every one of them is
-- something an admin adds to without a code change: a new city on expansion, a
-- new streaming platform, a new business category. Enums would need a migration
-- each time; free text would break grouping in the reports.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
create table if not exists public.cities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  state      text,
  timezone   text not null default 'America/Chicago',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, state)
);

-- ---------------------------------------------------------------------------
-- Roles are a lookup + join table, not a column on profiles. A lounge employee
-- who is also a signed artist is a real case, and one enum column cannot hold it.
create table if not exists public.roles (
  code        text primary key,
  description text not null
);

insert into public.roles (code, description) values
  ('fan',    'Default. Reads published content and their own data.'),
  ('staff',  'Redeems codes and checks fans in, at assigned venues only.'),
  ('artist', 'Reads engagement data for their own artist record only.'),
  ('admin',  'Full access, including economics and role grants.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Streaming destinations. url_pattern validates what an admin pastes;
-- native_scheme_template documents how the app builds the direct app link.
create table if not exists public.link_platforms (
  code                   text primary key,
  display_name           text not null,
  url_pattern            text not null,
  native_scheme_template text,
  accent_color           text,
  sort_order             integer not null default 0,
  is_active              boolean not null default true
);

insert into public.link_platforms
  (code, display_name, url_pattern, native_scheme_template, accent_color, sort_order) values
  ('spotify', 'Spotify',
   '^https://(open\.)?spotify\.com/', 'spotify:{kind}:{id}', '#1DB954', 10),
  ('youtube', 'YouTube',
   '^https://((www|m|music)\.)?youtube\.com/|^https://youtu\.be/', 'vnd.youtube://{id}', '#FF0000', 20),
  ('apple', 'Apple Music',
   '^https://music\.apple\.com/', 'music://{host}{path}', '#FA243C', 30)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
create table if not exists public.social_platforms (
  code         text primary key,
  display_name text not null,
  url_pattern  text not null,
  sort_order   integer not null default 0
);

insert into public.social_platforms (code, display_name, url_pattern, sort_order) values
  ('instagram', 'Instagram', '^https://(www\.)?instagram\.com/',       10),
  ('tiktok',    'TikTok',    '^https://(www\.)?tiktok\.com/',          20),
  ('x',         'X',         '^https://(www\.)?(x|twitter)\.com/',     30),
  ('youtube',   'YouTube',   '^https://(www\.)?youtube\.com/',         40),
  ('spotify',   'Spotify',   '^https://open\.spotify\.com/artist/',    50)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
create table if not exists public.business_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Settings that must be changeable without an app release.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
