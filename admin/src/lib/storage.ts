import { supabase } from './supabase';

export type Bucket = 'artist-photos' | 'cover-art' | 'business-logos';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** Uploads an image and returns its public URL.
 *  Filenames are randomised so re-uploading for the same record never collides
 *  and never leaks the original filename into a public URL. */
export async function uploadImage(bucket: Bucket, file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Image must be a JPEG, PNG or WebP.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`Image must be under ${MAX_BYTES / 1024 / 1024}MB (this one is ${(file.size / 1024 / 1024).toFixed(1)}MB).`);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
