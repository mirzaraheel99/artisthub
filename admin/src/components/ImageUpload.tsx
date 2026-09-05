import { useState } from 'react';
import { uploadImage, type Bucket } from '../lib/storage';
import { Button, Field } from './ui';

export function ImageUpload({
  label,
  bucket,
  value,
  onChange,
  hint,
}: {
  label: string;
  bucket: Bucket;
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadImage(bucket, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label} error={error} hint={hint}>
      <div className="flex items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-ink-700 bg-ink-850">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-ink-400">No image</div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block w-full text-xs text-ink-400 file:mr-3 file:rounded file:border-0 file:bg-ink-800
                       file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-200 hover:file:bg-ink-700"
          />
          {busy ? <span className="text-xs text-ink-400">Uploading…</span> : null}
          {value ? (
            <Button type="button" variant="ghost" className="w-fit px-2 py-1 text-xs" onClick={() => onChange(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}
