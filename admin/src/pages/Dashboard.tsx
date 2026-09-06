import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card, ErrorState, Spinner } from '../components/ui';

interface Counts {
  artists: number;
  tracks: number;
  clicks: number;
}

export function Dashboard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setCounts(null);
    const [artists, tracks, clicks] = await Promise.all([
      supabase.from('artists').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('tracks').select('id', { count: 'exact', head: true }),
      supabase.from('link_clicks').select('id', { count: 'exact', head: true }),
    ]);

    const failure = artists.error ?? tracks.error ?? clicks.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setCounts({ artists: artists.count ?? 0, tracks: tracks.count ?? 0, clicks: clicks.count ?? 0 });
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink-200">Dashboard</h1>
      <p className="mt-1 text-sm text-ink-400">
        Phase 1 covers roster and catalogue. Users, referrals and rewards land in Phase 2.
      </p>

      {error ? (
        <div className="mt-6">
          <ErrorState error={error} onRetry={() => void load()} />
        </div>
      ) : !counts ? (
        <Spinner />
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Stat label="Artists" value={counts.artists} to="/artists" />
          <Stat label="Tracks" value={counts.tracks} to="/artists" />
          <Stat label="Link clicks" value={counts.clicks} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to?: string }) {
  const body = (
    <Card className="transition hover:border-ink-700">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="font-display mt-2 text-4xl text-gold-500">{value.toLocaleString()}</p>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
