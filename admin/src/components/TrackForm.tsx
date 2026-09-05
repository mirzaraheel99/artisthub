import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { LinkPlatform, Track } from '../lib/types';
import { PLATFORM_LABELS, streamingPlaceholder, validateStreamingUrl } from '../lib/streamingUrls';
import { Button, Card, Field, Input } from './ui';
import { ImageUpload } from './ImageUpload';

const PLATFORMS: LinkPlatform[] = ['spotify', 'youtube', 'apple'];

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
  const [title, setTitle] = useState(track?.title ?? '');
  const [coverArt, setCoverArt] = useState<string | null>(track?.cover_art_url ?? null);
  const [releaseDate, setReleaseDate] = useState(track?.release_date ?? '');
  const [isFeatured, setIsFeatured] = useState(track?.is_featured ?? false);
  const [urls, setUrls] = useState<Record<LinkPlatform, string>>({
    spotify: track?.spotify_url ?? '',
    youtube: track?.youtube_url ?? '',
    apple: track?.apple_music_url ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live per-field validation, so a bad paste is caught before save rather than
  // coming back as a Postgres constraint error.
  const urlErrors = PLATFORMS.reduce<Partial<Record<LinkPlatform, string>>>((acc, platform) => {
    const message = validateStreamingUrl(platform, urls[platform]);
    if (message) acc[platform] = message;
    return acc;
  }, {});

  const hasAnyLink = PLATFORMS.some((p) => urls[p].trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return setError('Title is required.');
    if (Object.keys(urlErrors).length > 0) return setError('Fix the streaming links before saving.');
    if (!hasAnyLink) {
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
      spotify_url: urls.spotify.trim() || null,
      youtube_url: urls.youtube.trim() || null,
      apple_music_url: urls.apple.trim() || null,
    };

    const { error: err } = track
      ? await supabase.from('tracks').update(payload).eq('id', track.id)
      : await supabase.from('tracks').insert(payload);

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="space-y-5">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <Field label="Release date">
          <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
        </Field>

        <ImageUpload label="Cover art" bucket="cover-art" value={coverArt} onChange={setCoverArt} hint="Square, at least 1000×1000." />

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

        {PLATFORMS.map((platform) => (
          <Field key={platform} label={PLATFORM_LABELS[platform]} error={urlErrors[platform]}>
            <Input
              type="url"
              placeholder={streamingPlaceholder(platform)}
              value={urls[platform]}
              onChange={(e) => setUrls((prev) => ({ ...prev, [platform]: e.target.value }))}
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
