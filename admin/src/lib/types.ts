// Row types mirror infra/supabase/migrations. These are type aliases rather
// than interfaces on purpose: supabase-js constrains rows to
// Record<string, unknown>, and an interface has no implicit index signature.

export type RoleCode = 'fan' | 'staff' | 'artist' | 'admin';
export type Tier = 'basic' | 'featured' | 'sponsor';
export type OpenedVia = 'native' | 'web' | 'failed';

export type City = {
  id: string;
  name: string;
  state: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
};

/** Streaming destinations are data, not an enum. Adding Tidal is a row here. */
export type LinkPlatform = {
  code: string;
  display_name: string;
  url_pattern: string;
  native_scheme_template: string | null;
  accent_color: string | null;
  sort_order: number;
  is_active: boolean;
};

export type SocialPlatform = {
  code: string;
  display_name: string;
  url_pattern: string;
  sort_order: number;
};

export type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone_e164: string | null;
  phone_verified_at: string | null;
  referral_code: string;
  referred_by: string | null;
  city_id: string | null;
  birthday: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRole = {
  user_id: string;
  role_code: RoleCode;
  granted_by: string | null;
  granted_at: string;
};

export type Artist = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  photo_url: string | null;
  city_id: string | null;
  install_code: string;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ArtistLink = {
  id: string;
  artist_id: string;
  platform_code: string;
  url: string;
};

export type ArtistSocial = {
  id: string;
  artist_id: string;
  platform_code: string;
  url: string;
};

export type Track = {
  id: string;
  artist_id: string;
  title: string;
  cover_art_url: string | null;
  release_date: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** One row per destination, replacing the old spotify_url/youtube_url columns. */
export type TrackLink = {
  id: string;
  track_id: string;
  platform_code: string;
  url: string;
  created_at: string;
};

export type LinkClick = {
  id: number;
  track_link_id: string;
  user_id: string | null;
  device_id: string | null;
  platform_code: string;
  city_id: string | null;
  opened_via: OpenedVia;
  clicked_at: string;
};

export type PointRule = {
  code: string;
  description: string;
  points: number;
  daily_cap: number | null;
  is_active: boolean;
  updated_at: string;
};

export type BlackoutRule = {
  id: string;
  name: string;
  weekday_mask: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type RewardCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  point_cost: number;
  referral_threshold: number | null;
  unit_cost_cents: number;
  menu_value_cents: number;
  requires_purchase: boolean;
  blackout_rule_id: string | null;
  validity_days: number;
  monthly_issue_cap: number | null;
  max_per_user_per_visit: number;
  is_welcome_offer: boolean;
  is_repeatable: boolean;
  is_active: boolean;
  sort_order: number;
};

export type RewardGrant = {
  id: string;
  user_id: string;
  reward_id: string;
  redemption_code: string;
  granted_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_venue_id: string | null;
  redeemed_by_staff_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  terms_reward_name: string;
  terms_requires_purchase: boolean;
  terms_unit_cost_cents: number;
  terms_menu_value_cents: number;
};

export type Referral = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  confirmed_at: string | null;
  confirming_redemption_id: string | null;
};

export type Venue = {
  id: string;
  city_id: string;
  name: string;
  address: string | null;
  timezone: string;
  business_day_cutoff: string;
  is_owned: boolean;
  is_active: boolean;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      cities: Table<City>;
      link_platforms: Table<LinkPlatform>;
      social_platforms: Table<SocialPlatform>;
      profiles: Table<Profile>;
      user_roles: Table<UserRole, { user_id: string; role_code: RoleCode }>;
      artists: Table<Artist, Partial<Artist> & { name: string; slug: string; install_code: string }>;
      artist_links: Table<ArtistLink, { artist_id: string; platform_code: string; url: string }>;
      artist_socials: Table<ArtistSocial, { artist_id: string; platform_code: string; url: string }>;
      tracks: Table<Track, Partial<Track> & { artist_id: string; title: string }>;
      track_links: Table<TrackLink, { track_id: string; platform_code: string; url: string }>;
      link_clicks: Table<LinkClick>;
      point_rules: Table<PointRule>;
      blackout_rules: Table<BlackoutRule>;
      reward_catalog: Table<RewardCatalogItem>;
      reward_venues: Table<
        { reward_id: string; venue_id: string },
        { reward_id: string; venue_id: string }
      >;
      reward_grants: Table<RewardGrant>;
      referrals: Table<Referral>;
      venues: Table<Venue>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: RoleCode };
    CompositeTypes: Record<string, never>;
  };
};
