import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Artist } from '../lib/types';
import { ArtistForm } from '../components/ArtistForm';
import { Badge, Button, EmptyState, ErrorState, Spinner } from '../components/ui';

export function Artists() {
  const [artists, setArtists] = useState<Artist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Artist | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('artists')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (err) setError(err.message);
    else setArtists(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Swaps sort_order with the neighbour. Two rows change, so we write both and
   *  reload rather than trying to patch local state optimistically. */
  const move = async (index: number, direction: -1 | 1) => {
    if (!artists) return;
    const target = artists[index + direction];
    const current = artists[index];
    if (!target || !current) return;

    setArtists(null);
    const [a, b] = await Promise.all([
      supabase.from('artists').update({ sort_order: target.sort_order }).eq('id', current.id),
      supabase.from('artists').update({ sort_order: current.sort_order }).eq('id', target.id),
    ]);
    const failure = a.error ?? b.error;
    if (failure) setError(failure.message);
    await load();
  };

  const remove = async (artist: Artist) => {
    const ok = window.confirm(
      `Delete "${artist.name}"? This also deletes every track under this artist and their click history. This cannot be undone.`,
    );
    if (!ok) return;

    const { error: err } = await supabase.from('artists').delete().eq('id', artist.id);
    if (err) setError(err.message);
    await load();
  };

  if (editing) {
    return (
      <ArtistForm
        artist={editing === 'new' ? null : editing}
        nextSortOrder={(artists?.at(-1)?.sort_order ?? 0) + 10}
        onDone={async () => {
          setEditing(null);
          await load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink-200">Artists</h1>
          <p className="mt-1 text-sm text-ink-400">Order here is the order fans see on the Discover grid.</p>
        </div>
        <Button onClick={() => setEditing('new')}>Add artist</Button>
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : !artists ? (
          <Spinner />
        ) : artists.length === 0 ? (
          <EmptyState
            title="No artists yet"
            body="Add the first artist on the roster. Fans see nothing on Discover until at least one artist exists."
            action={<Button onClick={() => setEditing('new')}>Add artist</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {artists.map((artist, index) => (
              <li
                key={artist.id}
                className="flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-3"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-ink-850">
                  {artist.photo_url ? (
                    <img src={artist.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-display truncate text-lg text-ink-200">{artist.name}</p>
                    {artist.is_featured ? <Badge tone="gold">Featured</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-ink-400">{artist.bio || 'No bio yet'}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                    aria-label={`Move ${artist.name} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    disabled={index === artists.length - 1}
                    onClick={() => void move(index, 1)}
                    aria-label={`Move ${artist.name} down`}
                  >
                    ↓
                  </Button>
                  <Link to={`/artists/${artist.id}`}>
                    <Button variant="secondary" className="px-3 py-1.5 text-xs">
                      Tracks
                    </Button>
                  </Link>
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(artist)}>
                    Edit
                  </Button>
                  <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => void remove(artist)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
