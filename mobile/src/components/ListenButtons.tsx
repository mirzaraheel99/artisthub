import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { PLATFORM_LABELS, availablePlatforms, openTrackLink } from '../lib/streaming';
import type { LinkPlatform, Track } from '../lib/types';

const ACCENT: Record<LinkPlatform, string> = {
  spotify: colors.spotify,
  youtube: colors.youtube,
  apple: colors.apple,
};

/**
 * The app's whole listening surface. Every one of these is a router out to a
 * real platform — there is no in-app playback anywhere, deliberately, so plays
 * count where they matter and no music licence is required.
 */
export function ListenButtons({ track, userId }: { track: Track; userId: string | null }) {
  const [pending, setPending] = useState<LinkPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const platforms = availablePlatforms(track);

  if (platforms.length === 0) return null;

  const handlePress = async (platform: LinkPlatform) => {
    setPending(platform);
    setError(null);
    const result = await openTrackLink(track, platform, userId);
    if (!result.opened) setError(result.error ?? 'Could not open the link.');
    setPending(null);
  };

  return (
    <View>
      <View style={styles.row}>
        {platforms.map((platform) => (
          <Pressable
            key={platform}
            style={({ pressed }) => [
              styles.button,
              { borderColor: ACCENT[platform] },
              pressed && styles.buttonPressed,
            ]}
            onPress={() => void handlePress(platform)}
            disabled={pending !== null}
            accessibilityRole="link"
            accessibilityLabel={`Listen to ${track.title} on ${PLATFORM_LABELS[platform]}`}
          >
            {pending === platform ? (
              <ActivityIndicator size="small" color={ACCENT[platform]} />
            ) : (
              <>
                <View style={[styles.dot, { backgroundColor: ACCENT[platform] }]} />
                <Text style={styles.label}>{PLATFORM_LABELS[platform]}</Text>
              </>
            )}
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
  },
  buttonPressed: { opacity: 0.6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
});
