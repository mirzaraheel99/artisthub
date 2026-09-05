export type UserRole = 'user' | 'staff' | 'admin';
export type LinkPlatform = 'spotify' | 'youtube' | 'apple';

export type SocialLinks = {
  instagram?: string;
  tiktok?: string;
  x?: string;
  youtube?: string;
  spotify?: string;
  [key: string]: string | undefined;
}

export type Artist = {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  social_links: SocialLinks;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type Track = {
  id: string;
  artist_id: string;
  title: string;
  cover_art_url: string | null;
  release_date: string | null;
  spotify_url: string | null;
  youtube_url: string | null;
  apple_music_url: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export type Profile = {
  id: string;
  name: string | null;
  contact: string | null;
  referral_code: string;
  referred_by: string | null;
  role: UserRole;
  city: string | null;
  push_token: string | null;
  is_banned: boolean;
  created_at: string;
}

export type LinkClick = {
  id: number;
  track_id: string;
  user_id: string | null;
  platform: LinkPlatform;
  clicked_at: string;
}

/** Minimal shape for supabase-js generics — hand-written rather than generated
 *  so the schema stays readable next to the SQL migrations. */
export type Database = {
  public: {
    Tables: {
      artists: {
        Row: Artist;
        Insert: Partial<Artist> & { name: string };
        Update: Partial<Artist>;
        Relationships: [];
      };
      tracks: {
        Row: Track;
        Insert: Partial<Track> & { artist_id: string; title: string };
        Update: Partial<Track>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; referral_code: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      link_clicks: {
        Row: LinkClick;
        Insert: { track_id: string; user_id?: string | null; platform: LinkPlatform };
        Update: Partial<LinkClick>;
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: unknown; updated_at: string };
        Insert: { key: string; value: unknown };
        Update: { value?: unknown };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: UserRole; link_platform: LinkPlatform };
    CompositeTypes: Record<string, never>;
  };
}
