import { supabase } from '../lib/supabase';
import type { Artist, ArtistSocial, LinkPlatform, Track, TrackLink } from '../lib/types';

export type TrackWithLinks = Track & { links: TrackLink[] };

export async function fetchLinkPlatforms(): Promise<LinkPlatform[]> {
  const { data, error } = await supabase
    .from('link_platforms')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchArtists(): Promise<Artist[]> {
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchArtist(artistId: string): Promise<Artist | null> {
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .eq('id', artistId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchArtistSocials(artistId: string): Promise<ArtistSocial[]> {
  const { data, error } = await supabase
    .from('artist_socials')
    .select('*')
    .eq('artist_id', artistId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Tracks with their destinations in one round trip — a track with no link
 *  cannot exist, so every row here has somewhere to send the fan. */
export async function fetchTracksByArtist(artistId: string): Promise<TrackWithLinks[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('*, links:track_links(*)')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('release_date', { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as TrackWithLinks[];
}

export type Release = TrackWithLinks & { artist: Pick<Artist, 'id' | 'name'> | null };

export async function fetchNewReleases(limit = 12): Promise<Release[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('*, links:track_links(*), artist:artists(id, name)')
    .eq('is_active', true)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as Release[];
}

export type Featured =
  | { kind: 'track'; track: TrackWithLinks; artist: Pick<Artist, 'id' | 'name'> | null }
  | { kind: 'artist'; artist: Artist }
  | null;

/** The Home banner: a featured track if one is set, otherwise a featured artist. */
export async function fetchFeatured(): Promise<Featured> {
  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('*, links:track_links(*), artist:artists(id, name)')
    .eq('is_featured', true)
    .eq('is_active', true)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (trackError) throw new Error(trackError.message);
  if (track) {
    const { artist, ...rest } = track as Release;
    return { kind: 'track', track: rest as TrackWithLinks, artist };
  }

  const { data: artist, error: artistError } = await supabase
    .from('artists')
    .select('*')
    .eq('is_featured', true)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (artistError) throw new Error(artistError.message);
  return artist ? { kind: 'artist', artist } : null;
}
