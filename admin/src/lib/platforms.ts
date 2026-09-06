import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { LinkPlatform, SocialPlatform } from './types';

/**
 * Platforms are rows, not hardcoded constants, so adding a destination is a
 * database insert rather than a redeploy. The URL pattern comes from the same
 * row the database validates against, which is what keeps the form's rules and
 * the constraint's rules from drifting apart.
 */
export function usePlatforms() {
  const [linkPlatforms, setLinkPlatforms] = useState<LinkPlatform[]>([]);
  const [socialPlatforms, setSocialPlatforms] = useState<SocialPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [links, socials] = await Promise.all([
        supabase.from('link_platforms').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('social_platforms').select('*').order('sort_order'),
      ]);
      if (cancelled) return;

      const failure = links.error ?? socials.error;
      if (failure) setError(failure.message);
      else {
        setLinkPlatforms(links.data ?? []);
        setSocialPlatforms(socials.data ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { linkPlatforms, socialPlatforms, loading, error };
}

/** Returns null when valid, otherwise a message to show under the field. */
export function validateAgainstPattern(
  value: string,
  pattern: string,
  platformName: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // empty is allowed; "at least one link" is checked separately

  if (!/^https:\/\//i.test(trimmed)) return 'Must start with https://';

  try {
    if (!new RegExp(pattern, 'i').test(trimmed)) {
      return `Doesn't look like a ${platformName} link.`;
    }
  } catch {
    return null; // a malformed stored pattern must not block the admin
  }
  return null;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/** Artist install codes are read aloud and typed from screenshots, so the
 *  alphabet drops the glyphs that get confused: 0/O, 1/I/L. */
export function generateInstallCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}
