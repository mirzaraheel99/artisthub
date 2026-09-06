import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { codeFromUrl, normalizeCode } from './referralCodes';

export { codeFromUrl, normalizeCode };

const PENDING_KEY = 'artisthub.pending_referral';

/**
 * A referral code has to survive the gap between tapping a friend's link and
 * finishing signup — which may include a trip to the App Store, a restart, and
 * several minutes. So it is captured on first launch and held locally until an
 * account actually exists.
 *
 * The code is then passed as signup metadata and attached inside the database
 * trigger, never by a second call afterwards: a second call can be skipped,
 * replayed, or pointed at a different referrer.
 */

export async function storePendingReferral(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, code);
  } catch {
    // Losing the stored code costs attribution, never the signup itself.
  }
}

export async function readPendingReferral(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to do: a stale code is ignored once an account exists.
  }
}

/**
 * Captures a code from the launch URL and from any link opened while running.
 * Returns an unsubscribe function.
 */
export function watchForReferral(onFound: (code: string) => void): () => void {
  void (async () => {
    const initial = await Linking.getInitialURL();
    if (!initial) return;
    const code = codeFromUrl(initial);
    if (code) {
      await storePendingReferral(code);
      onFound(code);
    }
  })();

  const sub = Linking.addEventListener('url', ({ url }) => {
    const code = codeFromUrl(url);
    if (code) {
      void storePendingReferral(code);
      onFound(code);
    }
  });

  return () => sub.remove();
}
