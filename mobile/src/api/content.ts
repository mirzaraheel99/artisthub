import { supabase } from '../lib/supabase';
import type { Artist, Track } from '../lib/types';

export async function fetchArtists(): Promise<Artist[]> {
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchArtist(artistId: string): Promise<Artist | null> {
  const { data, error } = await supabase.from('artists').select('*').eq('id', artistId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchTracksByArtist(artistId: string): Promise<Track[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .eq('artist_id', artistId)
    .order('release_date', { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Newest tracks across the whole roster, for the Discover "New Releases" row. */
export async function fetchNewReleases(limit = 12): Promise<(Track & { artist: Pick<Artist, 'id' | 'name'> | null })[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('*, artist:artists(id, name)')
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as (Track & { artist: Pick<Artist, 'id' | 'name'> | null })[];
}

/** The Home banner: a featured track if one is set, otherwise a featured artist. */
export async function fetchFeatured(): Promise<
  | { kind: 'track'; track: Track; artist: Pick<Artist, 'id' | 'name'> | null }
  | { kind: 'artist'; artist: Artist }
  | null
> {
  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('*, artist:artists(id, name)')
    .eq('is_featured', true)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (trackError) throw new Error(trackError.message);
  if (track) {
    const { artist, ...rest } = track as Track & { artist: Pick<Artist, 'id' | 'name'> | null };
    return { kind: 'track', track: rest as Track, artist };
  }

  const { data: artist, error: artistError } = await supabase
    .from('artists')
    .select('*')
    .eq('is_featured', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (artistError) throw new Error(artistError.message);
  return artist ? { kind: 'artist', artist } : null;
}
