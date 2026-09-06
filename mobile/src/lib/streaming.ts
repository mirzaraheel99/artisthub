import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import type { TrackLink } from './types';
import { nativeUrlFor } from './deepLinkUrls';

export { nativeUrlFor };

export type OpenResult = {
  opened: boolean;
  /** How it actually opened. This is what proves in production whether fans
   *  reach the real app or fall back to a web player. */
  openedVia: 'native' | 'web' | 'failed';
  error?: string;
};

/**
 * Records the tap, then opens the destination.
 *
 * Tracking is fire-and-forget on purpose: a fan tapping "listen" must never
 * wait on, or be blocked by, an analytics write. If the network is down the
 * link still opens and we lose one data point.
 *
 * This records a routing attempt and its outcome — never a "stream" or a
 * "play". We cannot observe whether anything was listened to, and no reward is
 * ever attached to this action: incentivised streaming violates the platforms'
 * terms and the penalty lands on the artist's account.
 */
export async function openTrackLink(
  link: TrackLink,
  userId: string | null,
  deviceId: string | null,
): Promise<OpenResult> {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const nativeUrl = nativeUrlFor(link.url, link.platform_code);

  if (nativeUrl) {
    try {
      if (await Linking.canOpenURL(nativeUrl)) {
        await Linking.openURL(nativeUrl);
        void recordClick(link, 'native', userId, deviceId);
        return { opened: true, openedVia: 'native' };
      }
    } catch {
      // canOpenURL throws on iOS when the scheme is not declared in
      // LSApplicationQueriesSchemes (see app.json). Fall through to https.
    }
  }

  try {
    await Linking.openURL(link.url);
    void recordClick(link, 'web', userId, deviceId);
    return { opened: true, openedVia: 'web' };
  } catch {
    void recordClick(link, 'failed', userId, deviceId);
    return { opened: false, openedVia: 'failed', error: "Couldn't open that link." };
  }
}

async function recordClick(
  link: TrackLink,
  openedVia: 'native' | 'web' | 'failed',
  userId: string | null,
  deviceId: string | null,
): Promise<void> {
  const { error } = await supabase.from('link_clicks').insert({
    track_link_id: link.id,
    platform_code: link.platform_code,
    opened_via: openedVia,
    user_id: userId,
    device_id: deviceId,
  });

  if (error && __DEV__) {
    console.warn('[link_clicks] insert failed:', error.message);
  }
}
