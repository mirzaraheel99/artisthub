import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Artist, LinkPlatform, Track } from '../lib/types';
import { PLATFORM_LABELS } from '../lib/streamingUrls';
import { TrackForm } from '../components/TrackForm';
import { Badge, Button, EmptyState, ErrorState, Spinner } from '../components/ui';

const PLATFORMS: LinkPlatform[] = ['spotify', 'youtube', 'apple'];

const URL_FOR: Record<LinkPlatform, (t: Track) => string | null> = {
  spotify: (t) => t.spotify_url,
  youtube: (t) => t.youtube_url,
  apple: (t) => t.apple_music_url,
};

export function ArtistDetail() {
  const { artistId } = useParams<{ artistId: string }>();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Track | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!artistId) return;
    setError(null);

    const [artistRes, tracksRes] = await Promise.all([
      supabase.from('artists').select('*').eq('id', artistId).maybeSingle(),
      supabase
        .from('tracks')
        .select('*')
        .eq('artist_id', artistId)
        .order('release_date', { ascending: false, nullsFirst: false }),
    ]);

    const failure = artistRes.error ?? tracksRes.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setArtist(artistRes.data ?? null);
    setTracks(tracksRes.data ?? []);
  }, [artistId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (track: Track) => {
    if (!window.confirm(`Delete "${track.title}"? Its click history goes with it.`)) return;
    const { error: err } = await supabase.from('tracks').delete().eq('id', track.id);
    if (err) setError(err.message);
    await load();
  };

  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!artist || !tracks) return <Spinner />;

  return (
    <div className="max-w-3xl">
      <Link to="/artists" className="text-xs text-ink-400 hover:text-gold-500">
        ← All artists
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink-200">{artist.name}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </p>
        </div>
        {!editing ? <Button onClick={() => setEditing('new')}>Add track</Button> : null}
      </div>

      {editing ? (
        <div className="mt-6">
          <h2 className="font-display mb-4 text-xl text-ink-200">
            {editing === 'new' ? 'Add track' : `Edit "${editing.title}"`}
          </h2>
          <TrackForm
            artistId={artist.id}
            track={editing === 'new' ? null : editing}
            onDone={async () => {
              setEditing(null);
              await load();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : tracks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No tracks yet"
            body={`${artist.name}'s profile will show a bio and socials, but nothing to listen to until a track is added.`}
            action={<Button onClick={() => setEditing('new')}>Add track</Button>}
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {tracks.map((track) => (
            <li key={track.id} className="flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-ink-850">
                {track.cover_art_url ? (
                  <img src={track.cover_art_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-ink-200">{track.title}</p>
                  {track.is_featured ? <Badge tone="gold">Featured</Badge> : null}
                </div>
                <p className="text-xs text-ink-400">{track.release_date ?? 'No release date'}</p>
                <div className="mt-1.5 flex gap-1.5">
                  {PLATFORMS.map((platform) =>
                    URL_FOR[platform](track) ? (
                      <Badge key={platform} tone="purple">
                        {PLATFORM_LABELS[platform]}
                      </Badge>
                    ) : null,
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(track)}>
                  Edit
                </Button>
                <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => void remove(track)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
