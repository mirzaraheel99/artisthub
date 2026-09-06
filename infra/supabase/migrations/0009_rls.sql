-- Row Level Security.
--
-- Every access rule in the system is expressed here. The UI hiding a control is
-- a convenience; this file is the control. Deny by default: enabling RLS with
-- no matching policy blocks the operation.

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they can read user_roles without recursing
-- through the very policies that call them.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(target_role text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role_code = target_role
      and p.is_banned = false          -- a ban revokes every role at once
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('staff') or public.has_role('admin');
$$;

-- A banned user keeps a valid JWT until it expires, so every policy that grants
-- anything must consult this rather than trusting the token.
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_banned = false
  );
$$;

create or replace function public.owns_artist(target_artist uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.artist_members
    where artist_id = target_artist and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.user_roles            enable row level security;
alter table public.devices               enable row level security;
alter table public.push_tokens           enable row level security;
alter table public.cities                enable row level security;
alter table public.roles                 enable row level security;
alter table public.link_platforms        enable row level security;
alter table public.social_platforms      enable row level security;
alter table public.business_categories   enable row level security;
alter table public.app_settings          enable row level security;
alter table public.venues                enable row level security;
alter table public.venue_staff           enable row level security;
alter table public.venue_visits          enable row level security;
alter table public.artists               enable row level security;
alter table public.artist_members        enable row level security;
alter table public.artist_links          enable row level security;
alter table public.artist_socials        enable row level security;
alter table public.tracks                enable row level security;
alter table public.track_links           enable row level security;
alter table public.link_clicks           enable row level security;
alter table public.exclusive_posts       enable row level security;
alter table public.exclusive_post_views  enable row level security;
alter table public.point_rules           enable row level security;
alter table public.point_transactions    enable row level security;
alter table public.blackout_rules        enable row level security;
alter table public.reward_catalog        enable row level security;
alter table public.reward_grants         enable row level security;
alter table public.reward_venues         enable row level security;
alter table public.redemption_operations enable row level security;
alter table public.referrals             enable row level security;
alter table public.businesses            enable row level security;
alter table public.offers                enable row level security;
alter table public.offer_redemptions     enable row level security;
alter table public.events                enable row level security;
alter table public.event_artists         enable row level security;
alter table public.event_rsvps           enable row level security;
alter table public.notification_campaigns    enable row level security;
alter table public.notification_deliveries   enable row level security;
alter table public.audit_log             enable row level security;
alter table public.abuse_flags           enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data: readable by everyone, writable by admins.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'cities','roles','link_platforms','social_platforms','business_categories','blackout_rules'
  ] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format($f$create policy %I_admin on public.%I for all
                     using (public.is_admin()) with check (public.is_admin())$f$, t, t);
  end loop;
end $$;

-- app_settings and point_rules are readable (the app needs thresholds and earn
-- rates) but only an admin may change the economics.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists point_rules_read on public.point_rules;
create policy point_rules_read on public.point_rules for select using (true);
drop policy if exists point_rules_admin on public.point_rules;
create policy point_rules_admin on public.point_rules for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- A user may edit their own row, but the columns that decide trust and money
-- are frozen by comparing against what is already stored. Without this WITH
-- CHECK, a single PATCH makes the caller an admin.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid() and is_banned = false)
  with check (
    id = auth.uid()
    and referral_code     =  (select p.referral_code     from public.profiles p where p.id = auth.uid())
    and referred_by       is not distinct from
                             (select p.referred_by       from public.profiles p where p.id = auth.uid())
    and is_banned         =  (select p.is_banned         from public.profiles p where p.id = auth.uid())
    and phone_verified_at is not distinct from
                             (select p.phone_verified_at from public.profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- user_roles: readable for yourself, writable only by an admin. There is no
-- path from a client to a role grant.
-- ---------------------------------------------------------------------------
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_roles_admin on public.user_roles;
create policy user_roles_admin on public.user_roles for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- devices + push tokens: strictly your own
-- ---------------------------------------------------------------------------
drop policy if exists devices_own on public.devices;
create policy devices_own on public.devices for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Venues and staff
-- ---------------------------------------------------------------------------
drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues for select using (is_active or public.is_admin());
drop policy if exists venues_admin on public.venues;
create policy venues_admin on public.venues for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists venue_staff_select on public.venue_staff;
create policy venue_staff_select on public.venue_staff
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists venue_staff_admin on public.venue_staff;
create policy venue_staff_admin on public.venue_staff for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists venue_visits_select on public.venue_visits;
create policy venue_visits_select on public.venue_visits
  for select using (user_id = auth.uid() or public.is_admin());
-- Visits are written by redeem_code (SECURITY DEFINER), never by a client.
drop policy if exists venue_visits_admin on public.venue_visits;
create policy venue_visits_admin on public.venue_visits for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catalogue: world-readable content, admin-only writes
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['artists','artist_links','artist_socials','tracks','track_links'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
    execute format('drop policy if exists %I_admin on public.%I', t, t);
    execute format($f$create policy %I_admin on public.%I for all
                     using (public.is_admin()) with check (public.is_admin())$f$, t, t);
  end loop;
end $$;

drop policy if exists artist_members_select on public.artist_members;
create policy artist_members_select on public.artist_members
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists artist_members_admin on public.artist_members;
create policy artist_members_admin on public.artist_members for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- link_clicks: anyone may log a click, but only for themselves. Reads are
-- admin, or an artist reading clicks on their own tracks.
-- ---------------------------------------------------------------------------
drop policy if exists link_clicks_insert on public.link_clicks;
create policy link_clicks_insert on public.link_clicks
  for insert with check (user_id is null or user_id = auth.uid());

drop policy if exists link_clicks_read on public.link_clicks;
create policy link_clicks_read on public.link_clicks
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.track_links tl
      join public.tracks t on t.id = tl.track_id
      where tl.id = link_clicks.track_link_id
        and public.owns_artist(t.artist_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Vault: signed-in users only. This is the exclusivity the whole retention
-- argument rests on, so it is not public.
-- ---------------------------------------------------------------------------
drop policy if exists exclusive_posts_read on public.exclusive_posts;
create policy exclusive_posts_read on public.exclusive_posts
  for select using (
    public.is_active_user()
    and publish_at <= now()
    and (expires_at is null or expires_at > now())
  );

drop policy if exists exclusive_posts_artist_read on public.exclusive_posts;
create policy exclusive_posts_artist_read on public.exclusive_posts
  for select using (public.is_admin() or public.owns_artist(artist_id));

drop policy if exists exclusive_posts_admin on public.exclusive_posts;
create policy exclusive_posts_admin on public.exclusive_posts for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists exclusive_views_own on public.exclusive_post_views;
create policy exclusive_views_own on public.exclusive_post_views
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Points: readable for yourself. No client write path at all — every insert
-- goes through award_points or spend_points.
-- ---------------------------------------------------------------------------
drop policy if exists point_tx_select on public.point_transactions;
create policy point_tx_select on public.point_transactions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists point_tx_admin_insert on public.point_transactions;
create policy point_tx_admin_insert on public.point_transactions
  for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------
drop policy if exists reward_catalog_read on public.reward_catalog;
create policy reward_catalog_read on public.reward_catalog
  for select using (is_active or public.is_admin());
drop policy if exists reward_catalog_admin on public.reward_catalog;
create policy reward_catalog_admin on public.reward_catalog for all
  using (public.is_admin()) with check (public.is_admin());

-- A fan sees only their own grants. Staff never browse grants: they validate a
-- code through redeem_code, which returns one result and no listing.
drop policy if exists reward_grants_select on public.reward_grants;
create policy reward_grants_select on public.reward_grants
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists reward_grants_admin on public.reward_grants;
create policy reward_grants_admin on public.reward_grants for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists reward_venues_read on public.reward_venues;
create policy reward_venues_read on public.reward_venues for select using (true);
drop policy if exists reward_venues_admin on public.reward_venues;
create policy reward_venues_admin on public.reward_venues for all
  using (public.is_admin()) with check (public.is_admin());

-- Written only by redeem_code. A staff member may read back their own receipts
-- to resolve an uncertain scan, and nothing else.
drop policy if exists redemption_ops_own on public.redemption_operations;
create policy redemption_ops_own on public.redemption_operations
  for select using (staff_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Referrals: both sides can see their own; nobody but an admin writes.
-- Status is set by redeem_code alone.
-- ---------------------------------------------------------------------------
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals
  for select using (referrer_id = auth.uid() or referred_user_id = auth.uid() or public.is_admin());

drop policy if exists referrals_admin on public.referrals;
create policy referrals_admin on public.referrals for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Businesses, offers, events
-- ---------------------------------------------------------------------------
drop policy if exists businesses_read on public.businesses;
create policy businesses_read on public.businesses
  for select using (is_active or public.is_admin());
drop policy if exists businesses_admin on public.businesses;
create policy businesses_admin on public.businesses for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists offers_read on public.offers;
create policy offers_read on public.offers
  for select using (
    public.is_admin()
    or (is_active and starts_on <= current_date and (ends_on is null or ends_on >= current_date))
  );
drop policy if exists offers_admin on public.offers;
create policy offers_admin on public.offers for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists offer_redemptions_select on public.offer_redemptions;
create policy offer_redemptions_select on public.offer_redemptions
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists offer_redemptions_insert on public.offer_redemptions;
create policy offer_redemptions_insert on public.offer_redemptions
  for insert with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists offer_redemptions_admin on public.offer_redemptions;
create policy offer_redemptions_admin on public.offer_redemptions for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists events_read on public.events;
create policy events_read on public.events
  for select using (is_published or public.is_admin());
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists event_artists_read on public.event_artists;
create policy event_artists_read on public.event_artists for select using (true);
drop policy if exists event_artists_admin on public.event_artists;
create policy event_artists_admin on public.event_artists for all
  using (public.is_admin()) with check (public.is_admin());

-- A fan owns their RSVP *intent* only. attended_at feeds a points award, so a
-- row-level "it's your row" check is not enough: without this the fan simply
-- includes attended_at in the insert and pays themselves for a show they never
-- came to. RLS has no column granularity, so the trigger below strips it.
drop policy if exists event_rsvps_own on public.event_rsvps;
create policy event_rsvps_own on public.event_rsvps
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() and public.is_active_user());

create or replace function public.guard_rsvp_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff() then
    return new;                       -- staff scan people in at the door
  end if;

  if tg_op = 'INSERT' then
    new.attended_at := null;
    new.attended_scanned_by := null;
  else
    new.attended_at := old.attended_at;
    new.attended_scanned_by := old.attended_scanned_by;
  end if;

  return new;
end $$;

drop trigger if exists event_rsvps_guard on public.event_rsvps;
create trigger event_rsvps_guard before insert or update on public.event_rsvps
  for each row execute function public.guard_rsvp_attendance();

-- ---------------------------------------------------------------------------
-- Notifications, audit, abuse: admin only. A user must not be able to read the
-- targeting of a campaign, nor the flags raised against them.
-- ---------------------------------------------------------------------------
drop policy if exists campaigns_admin on public.notification_campaigns;
create policy campaigns_admin on public.notification_campaigns for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists deliveries_admin on public.notification_deliveries;
create policy deliveries_admin on public.notification_deliveries for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select using (public.is_admin());
-- Deliberately no insert/update/delete policy: rows arrive only through the
-- SECURITY DEFINER audit trigger, and nobody can rewrite history through the API.

drop policy if exists abuse_flags_admin on public.abuse_flags;
create policy abuse_flags_admin on public.abuse_flags for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Hard privilege revocations.
--
-- Policies govern which rows are visible; these govern which verbs exist at
-- all. The ledger and the audit log are append-only for everyone, including
-- admins going through the API.
-- ---------------------------------------------------------------------------
revoke update, delete on public.point_transactions from anon, authenticated;
revoke update, delete on public.audit_log          from anon, authenticated;
revoke insert          on public.audit_log         from anon, authenticated;
-- Postgres grants EXECUTE to PUBLIC on every function by default, and revoking
-- from a named role does NOT remove that grant. Every internal function must be
-- revoked from PUBLIC explicitly or a fan can call it and mint their own points.
revoke all on function public.award_points(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.issue_reward(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.generate_referral_code()
  from public, anon, authenticated;
revoke all on function public.generate_redemption_code()
  from public, anon, authenticated;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.write_audit()
  from public, anon, authenticated;
revoke all on function public.guard_rsvp_attendance()
  from public, anon, authenticated;

-- Only these three are client-callable, and each validates the caller itself.
grant execute on function public.redeem_code(text, uuid, boolean, text) to authenticated;
grant execute on function public.spend_points(uuid)               to authenticated;
grant execute on function public.points_balance(uuid)             to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('artist-photos',  'artist-photos',  true),
  ('cover-art',      'cover-art',      true),
  ('business-logos', 'business-logos', true),
  ('vault-media',    'vault-media',    false)
on conflict (id) do nothing;

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select using (bucket_id in ('artist-photos','cover-art','business-logos'));

-- Vault media is the exclusivity the retention plan depends on, so it is not
-- public: signed-in users only, served through signed URLs.
drop policy if exists vault_read on storage.objects;
create policy vault_read on storage.objects
  for select using (bucket_id = 'vault-media' and public.is_active_user());

drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects
  for all
  using (bucket_id in ('artist-photos','cover-art','business-logos','vault-media') and public.is_admin())
  with check (bucket_id in ('artist-photos','cover-art','business-logos','vault-media') and public.is_admin());
