import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import type { LinkPlatform, Track } from './types';
import { nativeUrlFor } from './deepLinkUrls';

export { nativeUrlFor };

export const PLATFORM_LABELS: Record<LinkPlatform, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  apple: 'Apple Music',
};

export function webUrlFor(track: Track, platform: LinkPlatform): string | null {
  switch (platform) {
    case 'spotify':
      return track.spotify_url;
    case 'youtube':
      return track.youtube_url;
    case 'apple':
      return track.apple_music_url;
  }
}

export function availablePlatforms(track: Track): LinkPlatform[] {
  return (['spotify', 'youtube', 'apple'] as LinkPlatform[]).filter((p) => webUrlFor(track, p));
}

/**
 * Records the click, then opens the destination.
 *
 * Tracking is fire-and-forget on purpose: a fan tapping "listen" must never
 * wait on, or be blocked by, an analytics write. If the network is down the
 * link still opens and we lose one data point.
 */
export async function openTrackLink(
  track: Track,
  platform: LinkPlatform,
  userId: string | null,
): Promise<{ opened: boolean; error?: string }> {
  const webUrl = webUrlFor(track, platform);
  if (!webUrl) return { opened: false, error: 'No link for this platform.' };

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  void recordLinkClick(track.id, platform, userId);

  const nativeUrl = nativeUrlFor(webUrl, platform);

  if (nativeUrl) {
    try {
      if (await Linking.canOpenURL(nativeUrl)) {
        await Linking.openURL(nativeUrl);
        return { opened: true };
      }
    } catch {
      // canOpenURL throws on iOS when the scheme isn't declared in
      // LSApplicationQueriesSchemes (see app.json). Fall through to https.
    }
  }

  try {
    await Linking.openURL(webUrl);
    return { opened: true };
  } catch {
    return { opened: false, error: `Couldn't open ${PLATFORM_LABELS[platform]}.` };
  }
}

export async function recordLinkClick(
  trackId: string,
  platform: LinkPlatform,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('link_clicks')
    .insert({ track_id: trackId, platform, user_id: userId });

  if (error && __DEV__) {
    console.warn('[link_clicks] insert failed:', error.message);
  }
}
