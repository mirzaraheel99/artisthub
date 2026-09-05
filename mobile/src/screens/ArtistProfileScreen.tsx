import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchArtist, fetchTracksByArtist } from '../api/content';
import type { Artist, SocialLinks, Track } from '../lib/types';
import type { RootStackParamList } from '../navigation';
import { colors, radius, spacing, type } from '../theme';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { ListenButtons } from '../components/ListenButtons';
import { Grain } from '../components/Grain';
import { useSession } from '../lib/session';

type Props = NativeStackScreenProps<RootStackParamList, 'ArtistProfile'>;

const HERO_HEIGHT = Math.min(Dimensions.get('window').height * 0.52, 480);

const SOCIAL_ORDER: { key: keyof SocialLinks; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'x', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
];

export function ArtistProfileScreen({ route, navigation }: Props) {
  const { artistId, artistName } = route.params;
  const insets = useSafeAreaInsets();
  const { userId } = useSession();

  const [artist, setArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [artistData, trackData] = await Promise.all([
        fetchArtist(artistId),
        fetchTracksByArtist(artistId),
      ]);
      setArtist(artistData);
      setTracks(trackData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.');
    }
  }, [artistId]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const share = async () => {
    if (!artist) return;
    // Phase 2 swaps this for a referral link carrying the user's code.
    await Share.share({
      message: `Check out ${artist.name} on Artist Hub`,
      url: `artisthub://artist/${artist.id}`,
    });
  };

  if (loading) return <LoadingState label={`Loading ${artistName}`} />;
  if (error && !artist) return <ErrorState message={error} onRetry={onRefresh} />;
  if (!artist) {
    return (
      <EmptyState
        title="Artist not found"
        body="This artist may have been removed. Go back and pull to refresh."
      />
    );
  }

  const socials = SOCIAL_ORDER.filter((s) => artist.social_links?.[s.key]);
  const spotifyArtistUrl = artist.social_links?.spotify;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      <View style={styles.hero}>
        {artist.photo_url ? (
          <Image source={{ uri: artist.photo_url }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceRaised }]} />
        )}
        <Grain />
        <LinearGradient
          colors={['rgba(10,10,10,0.55)', 'rgba(10,10,10,0.05)', 'rgba(10,10,10,0.75)', colors.bg]}
          locations={[0, 0.35, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />

        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.back, { top: insets.top + spacing.sm }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <Text style={styles.backLabel}>←</Text>
        </Pressable>

        <View style={styles.heroContent}>
          <Text style={styles.heroName}>{artist.name.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {artist.bio ? <Text style={styles.bio}>{artist.bio}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable style={styles.shareButton} onPress={() => void share()} accessibilityRole="button">
            <Text style={styles.shareLabel}>Share</Text>
          </Pressable>
          {socials.map((social) => (
            <Pressable
              key={String(social.key)}
              style={styles.socialChip}
              onPress={() => void Linking.openURL(artist.social_links[social.key]!)}
              accessibilityRole="link"
              accessibilityLabel={`${artist.name} on ${social.label}`}
            >
              <Text style={styles.socialLabel}>{social.label}</Text>
            </Pressable>
          ))}
        </View>

        {spotifyArtistUrl ? (
          <Pressable
            style={styles.followCard}
            onPress={() => void Linking.openURL(spotifyArtistUrl)}
            accessibilityRole="link"
          >
            <Text style={styles.followTitle}>Follow {artist.name} on Spotify</Text>
            <Text style={styles.followBody}>
              Following means every future release lands in their Release Radar — it compounds far
              more than a single play.
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Music</Text>

        {tracks.length === 0 ? (
          <EmptyState
            title="No tracks yet"
            body={`${artist.name} hasn't got anything up here yet. Check back soon.`}
          />
        ) : (
          tracks.map((track) => (
            <View key={track.id} style={styles.trackRow}>
              <View style={styles.trackArt}>
                {track.cover_art_url ? (
                  <Image source={{ uri: track.cover_art_url }} style={StyleSheet.absoluteFill} />
                ) : null}
              </View>
              <View style={styles.trackInfo}>
                <Text numberOfLines={2} style={styles.trackTitle}>
                  {track.title}
                </Text>
                {track.release_date ? (
                  <Text style={styles.trackDate}>{formatReleaseDate(track.release_date)}</Text>
                ) : null}
                <View style={{ marginTop: spacing.sm }}>
                  <ListenButtons track={track} userId={userId} />
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function formatReleaseDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  hero: { height: HERO_HEIGHT, justifyContent: 'flex-end', backgroundColor: colors.surfaceRaised },
  heroContent: { padding: spacing.md, paddingBottom: spacing.lg },
  heroName: { ...type.display, color: colors.text, fontSize: 42, lineHeight: 44 },
  back: {
    position: 'absolute',
    left: spacing.md,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.55)',
  },
  backLabel: { color: colors.text, fontSize: 20, lineHeight: 22 },

  body: { paddingHorizontal: spacing.md },
  bio: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  shareButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  shareLabel: { color: colors.bg, fontWeight: '700', fontSize: 13 },
  socialChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  socialLabel: { color: colors.text, fontWeight: '600', fontSize: 13 },

  followCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.purple,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  followTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  followBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },

  sectionTitle: { ...type.display, color: colors.text, fontSize: 20, marginTop: spacing.xl },

  trackRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  trackArt: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  trackInfo: { flex: 1 },
  trackTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  trackDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
