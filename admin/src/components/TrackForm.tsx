import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { usePlatforms, validateAgainstPattern } from '../lib/platforms';
import type { Track } from '../lib/types';
import { Button, Card, Field, Input, Spinner } from './ui';
import { ImageUpload } from './ImageUpload';

export function TrackForm({
  artistId,
  track,
  onDone,
  onCancel,
}: {
  artistId: string;
  track: Track | null;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { linkPlatforms, loading: platformsLoading } = usePlatforms();

  const [title, setTitle] = useState(track?.title ?? '');
  const [coverArt, setCoverArt] = useState<string | null>(track?.cover_art_url ?? null);
  const [releaseDate, setReleaseDate] = useState(track?.release_date ?? '');
  const [isFeatured, setIsFeatured] = useState(track?.is_featured ?? false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;

    void supabase
      .from('track_links')
      .select('platform_code, url')
      .eq('track_id', track.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setUrls(Object.fromEntries(data.map((row) => [row.platform_code, row.url])));
      });

    return () => {
      cancelled = true;
    };
  }, [track]);

  // Validated against the same pattern the database checks, so a bad paste is
  // caught here rather than coming back as a constraint violation.
  const urlErrors = linkPlatforms.reduce<Record<string, string>>((acc, platform) => {
    const message = validateAgainstPattern(
      urls[platform.code] ?? '',
      platform.url_pattern,
      platform.display_name,
    );
    if (message) acc[platform.code] = message;
    return acc;
  }, {});

  const linkRows = Object.entries(urls)
    .filter(([, url]) => url.trim())
    .map(([platform_code, url]) => ({ platform_code, url: url.trim() }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return setError('Title is required.');
    if (Object.keys(urlErrors).length > 0) return setError('Fix the streaming links before saving.');
    if (linkRows.length === 0) {
      return setError(
        'A track needs at least one streaming link. The app only routes fans out — a track with no destination does nothing.',
      );
    }

    setBusy(true);
    setError(null);

    const payload = {
      artist_id: artistId,
      title: title.trim(),
      cover_art_url: coverArt,
      release_date: releaseDate || null,
      is_featured: isFeatured,
    };

    let trackId = track?.id;

    if (track) {
      const { error: err } = await supabase.from('tracks').update(payload).eq('id', track.id);
      if (err) return fail(err.message);
    } else {
      const { data, error: err } = await supabase.from('tracks').insert(payload).select('id').single();
      if (err) return fail(err.message);
      trackId = data.id;
    }

    if (!trackId) return fail('The track was saved but no id came back.');

    const { error: delErr } = await supabase.from('track_links').delete().eq('track_id', trackId);
    if (delErr) return fail(delErr.message);

    const { error: insErr } = await supabase
      .from('track_links')
      .insert(linkRows.map((row) => ({ ...row, track_id: trackId })));
    if (insErr) return fail(insErr.message);

    await onDone();

    function fail(message: string) {
      setError(message);
      setBusy(false);
    }
  };

  if (platformsLoading) return <Spinner label="Loading platforms…" />;

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="space-y-5">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <Field label="Release date">
          <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
        </Field>

        <ImageUpload
          label="Cover art"
          bucket="cover-art"
          value={coverArt}
          onChange={setCoverArt}
          hint="Square, at least 1000×1000."
        />

        <label className="flex items-center gap-2 text-sm text-ink-200">
          <input
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-gold-500)]"
          />
          Feature on the Home banner
        </label>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Streaming links</p>
          <p className="mt-1 text-xs text-ink-400">
            At least one is required. These are where the app sends fans — plays count on the real platform.
          </p>
        </div>

        {linkPlatforms.map((platform) => (
          <Field key={platform.code} label={platform.display_name} error={urlErrors[platform.code]}>
            <Input
              type="url"
              value={urls[platform.code] ?? ''}
              onChange={(e) => setUrls((prev) => ({ ...prev, [platform.code]: e.target.value }))}
            />
          </Field>
        ))}
      </Card>

      {error ? <p className="text-sm text-danger-500">{error}</p> : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : track ? 'Save changes' : 'Add track'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
