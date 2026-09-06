import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  fetchArtists,
  fetchFeatured,
  fetchNewReleases,
  type Featured,
  type Release,
} from '../api/content';
import type { Artist } from '../lib/types';
import type { RootStackParamList } from '../navigation';
import { colors, radius, spacing, type } from '../theme';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { PressableScale } from '../components/PressableScale';
import { Grain } from '../components/Grain';

type Props = NativeStackScreenProps<RootStackParamList, 'Discover'>;

const GRID_GAP = spacing.md;
const CARD_WIDTH = (Dimensions.get('window').width - spacing.md * 2 - GRID_GAP) / 2;

export function DiscoverScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [featured, setFeatured] = useState<Featured>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [artistList, releaseList, featuredItem] = await Promise.all([
        fetchArtists(),
        fetchNewReleases(),
        fetchFeatured(),
      ]);
      setArtists(artistList);
      setReleases(releaseList);
      setFeatured(featuredItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.');
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const openArtist = (artist: Pick<Artist, 'id' | 'name'>) =>
    navigation.navigate('ArtistProfile', { artistId: artist.id, artistName: artist.name });

  if (loading) return <LoadingState label="Loading the roster" />;
  if (error && artists.length === 0) return <ErrorState message={error} onRetry={onRefresh} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      <Text style={styles.wordmark}>ARTIST HUB</Text>

      {featured ? (
        <FeaturedBanner
          featured={featured}
          onPress={(artist) => (artist ? openArtist(artist) : undefined)}
        />
      ) : null}

      {releases.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New Releases</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={releases}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.rowContent}
            renderItem={({ item }) => (
              <PressableScale
                onPress={() => (item.artist ? openArtist(item.artist) : undefined)}
                accessibilityLabel={`${item.title} by ${item.artist?.name ?? 'unknown artist'}`}
              >
                <View style={styles.releaseCard}>
                  <View style={styles.releaseArt}>
                    {item.cover_art_url ? (
                      <Image source={{ uri: item.cover_art_url }} style={StyleSheet.absoluteFill} />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={styles.releaseTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.releaseArtist}>
                    {item.artist?.name ?? ''}
                  </Text>
                </View>
              </PressableScale>
            )}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>The Roster</Text>

        {artists.length === 0 ? (
          <EmptyState
            title="Nobody on the roster yet"
            body="Artists show up here the moment the label adds them. Pull down to refresh."
          />
        ) : (
          <View style={styles.grid}>
            {artists.map((artist) => (
              <PressableScale
                key={artist.id}
                onPress={() => openArtist(artist)}
                accessibilityLabel={`Open ${artist.name}'s profile`}
              >
                <View style={styles.artistCard}>
                  {artist.photo_url ? (
                    <Image source={{ uri: artist.photo_url }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.artistFallback]} />
                  )}
                  <Grain />
                  <LinearGradient
                    colors={['transparent', 'rgba(10,10,10,0.15)', 'rgba(10,10,10,0.92)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.artistLabel}>
                    <Text numberOfLines={2} style={styles.artistName}>
                      {artist.name.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function FeaturedBanner({
  featured,
  onPress,
}: {
  featured: NonNullable<Featured>;
  onPress: (artist: Pick<Artist, 'id' | 'name'> | null) => void;
}) {
  const image = featured.kind === 'track' ? featured.track.cover_art_url : featured.artist.photo_url;
  const eyebrow = featured.kind === 'track' ? 'Featured Release' : 'Featured Artist';
  const title = featured.kind === 'track' ? featured.track.title : featured.artist.name;
  const subtitle = featured.kind === 'track' ? (featured.artist?.name ?? '') : 'Tap to open profile';
  const artist = featured.kind === 'track' ? featured.artist : featured.artist;

  return (
    <PressableScale
      onPress={() => onPress(artist ? { id: artist.id, name: artist.name } : null)}
      style={styles.banner}
      accessibilityLabel={`${eyebrow}: ${title}`}
    >
      {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} /> : null}
      <Grain />
      <LinearGradient
        colors={['rgba(10,10,10,0.1)', 'rgba(10,10,10,0.95)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bannerContent}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text numberOfLines={2} style={styles.bannerTitle}>
          {title.toUpperCase()}
        </Text>
        {subtitle ? <Text style={styles.bannerSubtitle}>{subtitle}</Text> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wordmark: {
    ...type.display,
    color: colors.gold,
    fontSize: 22,
    letterSpacing: 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  banner: {
    height: 240,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'flex-end',
  },
  bannerContent: { padding: spacing.md },
  eyebrow: { ...type.eyebrow, color: colors.gold, marginBottom: spacing.xs },
  bannerTitle: { ...type.display, color: colors.text, fontSize: 30, lineHeight: 32 },
  bannerSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },

  section: { marginTop: spacing.xl },
  sectionTitle: {
    ...type.display,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  rowContent: { paddingHorizontal: spacing.md, gap: spacing.md },

  releaseCard: { width: 132 },
  releaseArt: {
    width: 132,
    height: 132,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  releaseTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  releaseArtist: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: spacing.md,
  },
  artistCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.3,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'flex-end',
  },
  artistFallback: { backgroundColor: colors.surfaceRaised },
  artistLabel: { padding: spacing.sm + 2 },
  artistName: { ...type.display, color: colors.text, fontSize: 17, lineHeight: 19 },
});
