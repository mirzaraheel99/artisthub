import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { usePlatforms, validateAgainstPattern, slugify, generateInstallCode } from '../lib/platforms';
import type { Artist } from '../lib/types';
import { Button, Card, Field, Input, Spinner, Textarea } from './ui';
import { ImageUpload } from './ImageUpload';

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
  const { socialPlatforms, loading: platformsLoading } = usePlatforms();

  const [name, setName] = useState(artist?.name ?? '');
  const [bio, setBio] = useState(artist?.bio ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(artist?.photo_url ?? null);
  const [isFeatured, setIsFeatured] = useState(artist?.is_featured ?? false);
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Socials are rows, so they load separately from the artist record.
  useEffect(() => {
    if (!artist) return;
    let cancelled = false;

    void supabase
      .from('artist_socials')
      .select('platform_code, url')
      .eq('artist_id', artist.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setSocials(Object.fromEntries(data.map((row) => [row.platform_code, row.url])));
      });

    return () => {
      cancelled = true;
    };
  }, [artist]);

  const socialErrors = socialPlatforms.reduce<Record<string, string>>((acc, platform) => {
    const message = validateAgainstPattern(
      socials[platform.code] ?? '',
      platform.url_pattern,
      platform.display_name,
    );
    if (message) acc[platform.code] = message;
    return acc;
  }, {});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    if (Object.keys(socialErrors).length > 0) return setError('Fix the social links before saving.');

    setBusy(true);
    setError(null);

    const payload = {
      name: name.trim(),
      bio: bio.trim() || null,
      photo_url: photoUrl,
      is_featured: isFeatured,
    };

    let artistId = artist?.id;

    if (artist) {
      const { error: err } = await supabase.from('artists').update(payload).eq('id', artist.id);
      if (err) return fail(err.message);
    } else {
      const { data, error: err } = await supabase
        .from('artists')
        .insert({
          ...payload,
          slug: slugify(name),
          // Each artist gets their own trackable install link. An artist with a
          // following drives more installs than fan-to-fan referral does, and
          // this is what shows which artists actually deliver.
          install_code: generateInstallCode(),
          sort_order: nextSortOrder,
        })
        .select('id')
        .single();
      if (err) return fail(err.message);
      artistId = data.id;
    }

    if (!artistId) return fail('The artist was saved but no id came back.');

    // Replace the social rows wholesale: simpler and more predictable than
    // diffing, and the set is tiny.
    const rows = Object.entries(socials)
      .filter(([, url]) => url.trim())
      .map(([platform_code, url]) => ({ artist_id: artistId, platform_code, url: url.trim() }));

    const { error: delErr } = await supabase.from('artist_socials').delete().eq('artist_id', artistId);
    if (delErr) return fail(delErr.message);

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('artist_socials').insert(rows);
      if (insErr) return fail(insErr.message);
    }

    await onDone();

    function fail(message: string) {
      setError(message);
      setBusy(false);
    }
  };

  if (platformsLoading) return <Spinner label="Loading platforms…" />;

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

          {artist ? (
            <Field label="Install link" hint="Give this to the artist to post. Installs through it are attributed to them.">
              <Input readOnly value={`https://YOUR-DOMAIN/a/${artist.install_code}`} />
            </Field>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Social links</p>
          {socialPlatforms.map((platform) => (
            <Field key={platform.code} label={platform.display_name} error={socialErrors[platform.code]}>
              <Input
                type="url"
                value={socials[platform.code] ?? ''}
                onChange={(e) => setSocials((prev) => ({ ...prev, [platform.code]: e.target.value }))}
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
