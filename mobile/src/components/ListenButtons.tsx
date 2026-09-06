import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { openTrackLink } from '../lib/streaming';
import type { LinkPlatform, TrackLink } from '../lib/types';
import { useSession } from '../lib/session';

/**
 * The app's whole listening surface. Every one of these routes out to a real
 * platform — there is no in-app playback anywhere, by design, so plays count
 * where they matter and no music licence is required.
 *
 * Nothing here is ever rewarded. Points come from visits and referrals only;
 * rewarding a tap would be incentivised streaming, and the platforms penalise
 * the artist's account for it, not ours.
 */
export function ListenButtons({
  links,
  platforms,
  trackTitle,
}: {
  links: TrackLink[];
  platforms: LinkPlatform[];
  trackTitle: string;
}) {
  const { userId, deviceId } = useSession();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (links.length === 0) return null;

  // Ordered by the platform table so the app's button order is admin-controlled.
  const ordered = [...links].sort(
    (a, b) =>
      (platforms.find((p) => p.code === a.platform_code)?.sort_order ?? 999) -
      (platforms.find((p) => p.code === b.platform_code)?.sort_order ?? 999),
  );

  const handlePress = async (link: TrackLink) => {
    setPending(link.id);
    setError(null);
    const result = await openTrackLink(link, userId, deviceId);
    if (!result.opened) setError(result.error ?? 'Could not open the link.');
    setPending(null);
  };

  return (
    <View>
      <View style={styles.row}>
        {ordered.map((link) => {
          const platform = platforms.find((p) => p.code === link.platform_code);
          const label = platform?.display_name ?? link.platform_code;
          const accent = platform?.accent_color ?? colors.gold;

          return (
            <Pressable
              key={link.id}
              style={({ pressed }) => [styles.button, { borderColor: accent }, pressed && styles.pressed]}
              onPress={() => void handlePress(link)}
              disabled={pending !== null}
              accessibilityRole="link"
              accessibilityLabel={`Listen to ${trackTitle} on ${label}`}
            >
              {pending === link.id ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <View style={[styles.dot, { backgroundColor: accent }]} />
                  <Text style={styles.label}>{label}</Text>
                </>
              )}
            </Pressable>
          );
        })}
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
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
});
