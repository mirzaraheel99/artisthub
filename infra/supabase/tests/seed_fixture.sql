-- Shared fixture for the test suites. Creates a city, a venue, staff, fans,
-- an artist with a linked track, and a reward catalogue.
-- Loaded inside a transaction by each suite and rolled back.

insert into public.cities (id, name, state, timezone)
values ('00000000-0000-0000-0000-00000000c001', 'Houston', 'TX', 'America/Chicago');

insert into public.venues (id, city_id, name, timezone, business_day_cutoff, is_owned)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000c001',
        'The Lounge', 'America/Chicago', '04:00', true),
       ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000c001',
        'Partner Venue (Dallas)', 'America/Chicago', '04:00', false);

-- Users. The signup trigger creates profiles, roles and referral rows.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'fan-a@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'fan-b@test.local'),
  ('00000000-0000-0000-0000-00000000a003', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000a004', 'artist-one@test.local'),
  ('00000000-0000-0000-0000-00000000a005', 'artist-two@test.local'),
  ('00000000-0000-0000-0000-00000000a006', 'admin@test.local');

insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-00000000a003', 'staff'),
  ('00000000-0000-0000-0000-00000000a004', 'artist'),
  ('00000000-0000-0000-0000-00000000a005', 'artist'),
  ('00000000-0000-0000-0000-00000000a006', 'admin');

insert into public.venue_staff (venue_id, user_id)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a003');

-- Two artists, so we can prove one cannot read the other's data.
insert into public.artists (id, name, slug, install_code) values
  ('00000000-0000-0000-0000-00000000ab01', 'Artist One', 'artist-one', 'INSTALL1'),
  ('00000000-0000-0000-0000-00000000ab02', 'Artist Two', 'artist-two', 'INSTALL2');

insert into public.artist_members (artist_id, user_id) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000a004'),
  ('00000000-0000-0000-0000-00000000ab02', '00000000-0000-0000-0000-00000000a005');

insert into public.tracks (id, artist_id, title) values
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000ab01', 'Track One'),
  ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-00000000ab02', 'Track Two');

insert into public.track_links (id, track_id, platform_code, url) values
  ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-00000000bb01',
   'spotify', 'https://open.spotify.com/track/AAA'),
  ('00000000-0000-0000-0000-00000000dd02', '00000000-0000-0000-0000-00000000bb02',
   'spotify', 'https://open.spotify.com/track/BBB');

-- Rewards. The welcome offer is what confirms a referral.
insert into public.reward_catalog
  (id, name, point_cost, unit_cost_cents, menu_value_cents, requires_purchase,
   validity_days, is_welcome_offer, is_repeatable, blackout_rule_id)
values
  ('00000000-0000-0000-0000-00000000ff01', 'Mozzarella Sticks (welcome)',
   0, 150, 899, true, 30, true, false, null),
  ('00000000-0000-0000-0000-00000000ff02', 'Free Wings',
   300, 300, 1599, true, 90, false, true, null),
  ('00000000-0000-0000-0000-00000000ff03', 'Free Hookah (blackout)',
   600, 300, 2999, false, 90, false, true,
   (select id from public.blackout_rules limit 1));
