import type { LinkPlatform } from './types';

/** Patterns match the DB CHECK constraints in 0001_schema.sql. If you loosen
 *  one, loosen the other — otherwise the UI accepts a URL the insert rejects. */
const PATTERNS: Record<LinkPlatform, RegExp> = {
  spotify: /^https:\/\/(open\.)?spotify\.com\/.+/i,
  youtube: /^https:\/\/((www|m|music)\.)?youtube\.com\/.+|^https:\/\/youtu\.be\/.+/i,
  apple: /^https:\/\/music\.apple\.com\/.+/i,
};

export const PLATFORM_LABELS: Record<LinkPlatform, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  apple: 'Apple Music',
};

const EXAMPLES: Record<LinkPlatform, string> = {
  spotify: 'https://open.spotify.com/track/…',
  youtube: 'https://www.youtube.com/watch?v=…',
  apple: 'https://music.apple.com/us/album/…',
};

/** Returns null when valid, otherwise a message to show under the field. */
export function validateStreamingUrl(platform: LinkPlatform, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null; // empty is allowed; the "at least one link" rule is checked separately

  if (!/^https:\/\//i.test(value)) {
    return 'Must start with https://';
  }
  if (!PATTERNS[platform].test(value)) {
    return `Doesn't look like a ${PLATFORM_LABELS[platform]} link. Expected ${EXAMPLES[platform]}`;
  }
  return null;
}

export function streamingPlaceholder(platform: LinkPlatform): string {
  return EXAMPLES[platform];
}
