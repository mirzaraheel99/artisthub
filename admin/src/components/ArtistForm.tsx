import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Artist, SocialLinks } from '../lib/types';
import { Button, Card, Field, Input, Textarea } from './ui';
import { ImageUpload } from './ImageUpload';

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
  { key: 'x', label: 'X', placeholder: 'https://x.com/…' },
  { key: 'spotify', label: 'Spotify artist page', placeholder: 'https://open.spotify.com/artist/…' },
  { key: 'youtube', label: 'YouTube channel', placeholder: 'https://youtube.com/@…' },
];

export function ArtistForm({
  artist,
  nextSortOrder,
  onDone,
  onCancel,
}: {
  artist: Artist | null;
  nextSortOrder: number;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(artist?.name ?? '');
  const [bio, setBio] = useState(artist?.bio ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(artist?.photo_url ?? null);
  const [isFeatured, setIsFeatured] = useState(artist?.is_featured ?? false);
  const [social, setSocial] = useState<SocialLinks>(artist?.social_links ?? {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setBusy(true);
    setError(null);

    // Drop empty social fields so the stored jsonb stays clean rather than
    // filling with empty strings the app would then have to filter.
    const cleanedSocial = Object.fromEntries(
      Object.entries(social).filter(([, value]) => value && value.trim()),
    ) as SocialLinks;

    const payload = {
      name: name.trim(),
      bio: bio.trim() || null,
      photo_url: photoUrl,
      social_links: cleanedSocial,
      is_featured: isFeatured,
    };

    const { error: err } = artist
      ? await supabase.from('artists').update(payload).eq('id', artist.id)
      : await supabase.from('artists').insert({ ...payload, sort_order: nextSortOrder });

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await onDone();
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl text-ink-200">{artist ? 'Edit artist' : 'Add artist'}</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Card className="space-y-5">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artist name" required />
          </Field>

          <Field label="Bio" hint="Shown on the artist profile under the hero image.">
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} />
          </Field>

          <ImageUpload
            label="Photo"
            bucket="artist-photos"
            value={photoUrl}
            onChange={setPhotoUrl}
            hint="Used full-bleed behind the artist name. Portrait or square, at least 1200px wide."
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
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Social links</p>
          {SOCIAL_FIELDS.map((field) => (
            <Field key={String(field.key)} label={field.label}>
              <Input
                type="url"
                placeholder={field.placeholder}
                value={social[field.key] ?? ''}
                onChange={(e) => setSocial((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            </Field>
          ))}
        </Card>

        {error ? <p className="text-sm text-danger-500">{error}</p> : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : artist ? 'Save changes' : 'Create artist'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
