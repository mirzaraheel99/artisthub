-- Identity: profiles, roles, devices, push tokens.

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  email             text,
  phone_e164        text,
  phone_verified_at timestamptz,
  referral_code     text not null unique,
  referred_by       uuid references public.profiles(id) on delete set null,
  city_id           uuid references public.cities(id) on delete set null,
  birthday          date,
  is_banned         boolean not null default false,
  ban_reason        text,
  banned_at         timestamptz,
  banned_by         uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint profiles_no_self_referral check (referred_by is null or referred_by <> id)
);

create index if not exists profiles_referral_code_idx on public.profiles (referral_code);
create index if not exists profiles_referred_by_idx   on public.profiles (referred_by);
create index if not exists profiles_city_idx          on public.profiles (city_id);

-- One account per verified phone number. This is the cheapest, highest-leverage
-- control against disposable-signup farming, so it is a hard database rule
-- rather than a check in the signup screen.
create unique index if not exists profiles_phone_unique
  on public.profiles (phone_e164) where phone_verified_at is not null;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_code  text not null references public.roles(code),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create index if not exists user_roles_role_idx on public.user_roles (role_code);

-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  install_id    text not null,
  platform      text not null check (platform in ('ios','android','web')),
  model         text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (user_id, install_id)
);

-- Deliberately not unique across users: households legitimately share a tablet.
-- Repeated signups from one install_id are a signal for the abuse queue to
-- review, not grounds for an automatic block.
create index if not exists devices_install_idx on public.devices (install_id);

-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  device_id  uuid references public.devices(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- A token identifies one install. If it reappears under another user the earlier
-- registration must be revoked first, or notifications reach the wrong person.
create unique index if not exists push_tokens_active_unique
  on public.push_tokens (token) where revoked_at is null;
create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Referral codes are produced server-side so a client can never choose its own.
-- The alphabet excludes 0 O 1 I L because these get read aloud across a loud
-- room and typed from screenshots.
create or replace function public.generate_referral_code()
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
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.profiles where referral_code = candidate);

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'could not generate a unique referral code after % attempts', attempt;
    end if;
  end loop;

  return candidate;
end $$;
