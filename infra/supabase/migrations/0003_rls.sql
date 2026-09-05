-- Row Level Security.
-- Everything the app is allowed to do is expressed here, not in client code.
-- Deny-by-default: enabling RLS with no matching policy blocks the operation.

alter table public.profiles     enable row level security;
alter table public.artists      enable row level security;
alter table public.tracks       enable row level security;
alter table public.link_clicks  enable row level security;
alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------------------
-- Role helpers
--
-- These are security definer so they can read profiles.role without recursing
-- back through the profiles policies that call them.
-- ---------------------------------------------------------------------------
create or replace function public.current_role_is(target user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = target and is_banned = false
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_is('admin');
$$;

create or replace function public.is_staff_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff','admin') and is_banned = false
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- A user may edit their own row but must not be able to promote themselves or
-- rewrite their referral lineage, so those columns are frozen by the WITH CHECK.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role        = (select p.role        from public.profiles p where p.id = auth.uid())
    and referral_code = (select p.referral_code from public.profiles p where p.id = auth.uid())
    and referred_by is not distinct from (select p.referred_by from public.profiles p where p.id = auth.uid())
    and is_banned   = (select p.is_banned   from public.profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- artists / tracks — world-readable content, admin-only writes
-- ---------------------------------------------------------------------------
drop policy if exists artists_public_read on public.artists;
create policy artists_public_read on public.artists
  for select using (true);

drop policy if exists artists_admin_write on public.artists;
create policy artists_admin_write on public.artists
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists tracks_public_read on public.tracks;
create policy tracks_public_read on public.tracks
  for select using (true);

drop policy if exists tracks_admin_write on public.tracks;
create policy tracks_admin_write on public.tracks
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- link_clicks
--
-- Anyone (including a signed-out browser) may record a click, but only for
-- themselves: user_id must be their own id or null. Reads are admin-only so one
-- user cannot profile another user's listening from the client.
-- ---------------------------------------------------------------------------
drop policy if exists link_clicks_insert on public.link_clicks;
create policy link_clicks_insert on public.link_clicks
  for insert with check (user_id is null or user_id = auth.uid());

drop policy if exists link_clicks_admin_read on public.link_clicks;
create policy link_clicks_admin_read on public.link_clicks
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- app_settings — readable by the app (it needs reward thresholds), admin writes
-- ---------------------------------------------------------------------------
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (true);

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('artist-photos', 'artist-photos', true),
       ('cover-art',     'cover-art',     true),
       ('business-logos','business-logos',true)
on conflict (id) do nothing;

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id in ('artist-photos','cover-art','business-logos'));

drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects
  for all
  using (bucket_id in ('artist-photos','cover-art','business-logos') and public.is_admin())
  with check (bucket_id in ('artist-photos','cover-art','business-logos') and public.is_admin());
