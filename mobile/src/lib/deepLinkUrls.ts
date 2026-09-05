import type { LinkPlatform } from './types';

/**
 * Pure URL derivation, kept free of any React Native or Expo import so it can
 * be unit-tested in plain Node. streaming.ts wraps this with the side effects.
 *
 * Rewrites a web URL into the platform's native scheme.
 *
 * Why bother: an https URL usually opens the installed app via universal
 * links, but not always — it breaks when the user has turned off the app's
 * link handling, and on Android it can land in a browser disambiguation sheet.
 * Trying the native scheme first, then falling back to https, gives a reliable
 * "opens the real app, so the play counts there" path.
 *
 * Returns null when a native URL can't be derived confidently; the caller then
 * just opens the original https URL.
 */
export function nativeUrlFor(webUrl: string, platform: LinkPlatform): string | null {
  let parsed: URL;
  try {
    parsed = new URL(webUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  switch (platform) {
    case 'spotify':
      return spotifyNativeUrl(parsed);
    case 'youtube':
      return youtubeNativeUrl(parsed);
    case 'apple':
      return appleNativeUrl(parsed);
    default:
      return null;
  }
}

const SPOTIFY_KINDS = ['track', 'album', 'artist', 'playlist', 'episode', 'show'];

function spotifyNativeUrl(parsed: URL): string | null {
  if (!/(^|\.)spotify\.com$/i.test(parsed.hostname)) return null;

  // https://open.spotify.com/track/ID -> spotify:track:ID
  // Shared links often carry a locale prefix (/intl-de/track/ID), so we look
  // for the kind segment rather than assuming it comes first.
  const segments = parsed.pathname.split('/').filter(Boolean);
  const kindIndex = segments.findIndex((segment) => SPOTIFY_KINDS.includes(segment));
  const id = kindIndex === -1 ? undefined : segments[kindIndex + 1];

  if (!id) return null;
  return `spotify:${segments[kindIndex]}:${id}`;
}

function youtubeNativeUrl(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();

  // Both youtu.be/ID and youtube.com/watch?v=ID collapse to a video id.
  let videoId: string | undefined;
  if (/(^|\.)youtu\.be$/.test(host)) {
    videoId = parsed.pathname.split('/').filter(Boolean)[0];
  } else if (/(^|\.)youtube\.com$/.test(host)) {
    videoId = parsed.searchParams.get('v') ?? undefined;
    if (!videoId) {
      // /shorts/ID and /embed/ID also resolve to a plain video.
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments[0] === 'shorts' || segments[0] === 'embed') videoId = segments[1];
    }
  } else {
    return null;
  }

  if (!videoId) return null;
  return `vnd.youtube://${videoId}`;
}

function appleNativeUrl(parsed: URL): string | null {
  if (!/(^|\.)music\.apple\.com$/i.test(parsed.hostname)) return null;

  // The Music app answers on the music: scheme with an otherwise identical
  // URL, so swapping the protocol is all that's needed.
  return `music://${parsed.host}${parsed.pathname}${parsed.search}`;
}
