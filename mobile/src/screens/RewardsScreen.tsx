import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { AuthScreen } from './AuthScreen';
import { colors, radius, spacing, type } from '../theme';
import { brand, referralUrl } from '../brand';
import { ErrorState, LoadingState } from '../components/states';

type Grant = {
  id: string;
  redemption_code: string;
  expires_at: string;
  redeemed_at: string | null;
  terms_reward_name: string;
  terms_requires_purchase: boolean;
};

type Referral = { id: string; status: 'pending' | 'confirmed' | 'rejected'; created_at: string };

export function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, userId, loading: sessionLoading, refresh } = useSession();

  const [grants, setGrants] = useState<Grant[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);

    const [grantsRes, referralsRes, balanceRes] = await Promise.all([
      supabase
        .from('reward_grants')
        .select('id, redemption_code, expires_at, redeemed_at, terms_reward_name, terms_requires_purchase')
        .order('granted_at', { ascending: false }),
      supabase.from('referrals').select('id, status, created_at').eq('referrer_id', userId),
      supabase.rpc('points_balance', { target: userId }),
    ]);

    const failure = grantsRes.error ?? referralsRes.error;
    if (failure) {
      setError(failure.message);
      return;
    }

    setGrants((grantsRes.data ?? []) as Grant[]);
    setReferrals((referralsRes.data ?? []) as Referral[]);
    setBalance(typeof balanceRes.data === 'number' ? balanceRes.data : 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    void load().finally(() => setLoading(false));
  }, [load, userId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([refresh(), load()]).finally(() => setRefreshing(false));
  }, [load, refresh]);

  if (sessionLoading) return <LoadingState label="Loading" />;

  // Browsing the roster never requires an account. Signing in is asked for only
  // at the point of claiming something, which is where it earns the friction.
  if (!userId) return <AuthScreen />;

  if (loading) return <LoadingState label="Loading your rewards" />;
  if (error && grants.length === 0) return <ErrorState message={error} onRetry={onRefresh} />;

  const confirmed = referrals.filter((r) => r.status === 'confirmed').length;
  const pending = referrals.filter((r) => r.status === 'pending').length;
  const active = grants.filter((g) => !g.redeemed_at && new Date(g.expires_at) > new Date());
  const past = grants.filter((g) => g.redeemed_at || new Date(g.expires_at) <= new Date());

  const copyCode = async () => {
    if (!profile) return;
    await Clipboard.setStringAsync(profile.referral_code);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const invite = async () => {
    if (!profile) return;
    await Share.share({
      message:
        `Get on ${brand.name} — the roster, the drops, and a free plate at ${brand.venueNoun}. ` +
        `Use my code ${profile.referral_code}\n${referralUrl(profile.referral_code)}`,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      <Text style={styles.title}>REWARDS</Text>

      <View style={styles.codeCard}>
        <Text style={styles.eyebrow}>Your code</Text>
        <Pressable onPress={() => void copyCode()} accessibilityRole="button" accessibilityLabel="Copy your referral code">
          <Text style={styles.code}>{profile?.referral_code ?? '—'}</Text>
        </Pressable>
        <Text style={styles.copyHint}>{copied ? 'Copied' : 'Tap to copy'}</Text>

        <Pressable style={styles.inviteButton} onPress={() => void invite()} accessibilityRole="button">
          <Text style={styles.inviteLabel}>Invite friends</Text>
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <Stat label="Confirmed" value={confirmed} tone="gold" />
        <Stat label="Pending" value={pending} />
        <Stat label="Points" value={balance} tone="purple" />
      </View>

      {pending > 0 ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            A referral confirms when your friend claims their welcome offer at the lounge — not when
            they install. {pending === 1 ? 'One friend is' : `${pending} friends are`} nearly there.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Ready to use</Text>
      {active.length === 0 ? (
        <Text style={styles.empty}>
          Nothing to claim yet. Bring a friend through the door and their first visit earns you both
          something.
        </Text>
      ) : (
        active.map((grant) => <GrantCard key={grant.id} grant={grant} />)
      )}

      {past.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>History</Text>
          {past.map((grant) => (
            <View key={grant.id} style={styles.pastRow}>
              <Text style={styles.pastName}>{grant.terms_reward_name}</Text>
              <Text style={styles.pastMeta}>
                {grant.redeemed_at
                  ? `Used ${new Date(grant.redeemed_at).toLocaleDateString()}`
                  : `Expired ${new Date(grant.expires_at).toLocaleDateString()}`}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function GrantCard({ grant }: { grant: Grant }) {
  const daysLeft = Math.ceil(
    (new Date(grant.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <View style={styles.grantCard}>
      <Text style={styles.grantName}>{grant.terms_reward_name}</Text>
      <Text style={styles.grantCode}>{grant.redemption_code}</Text>
      <Text style={styles.grantHint}>Show this to staff at the lounge</Text>

      <View style={styles.grantMeta}>
        <Text style={[styles.grantMetaText, daysLeft <= 7 && styles.urgent]}>
          {daysLeft <= 0 ? 'Expires today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
        </Text>
        {grant.terms_requires_purchase ? (
          <Text style={styles.grantMetaText}>With any purchase</Text>
        ) : null}
      </View>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'gold' | 'purple' }) {
  const color = tone === 'gold' ? colors.gold : tone === 'purple' ? colors.purple : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...type.display, color: colors.text, fontSize: 26, paddingHorizontal: spacing.md },
  eyebrow: { ...type.eyebrow, color: colors.textMuted },

  codeCard: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  code: {
    ...type.display,
    color: colors.gold,
    fontSize: 40,
    letterSpacing: 6,
    marginTop: spacing.sm,
  },
  copyHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  inviteButton: {
    marginTop: spacing.md,
    minHeight: 48,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteLabel: { color: colors.bg, fontSize: 16, fontWeight: '800' },

  statRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm },
  stat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  statValue: { ...type.display, fontSize: 26 },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  note: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.purple,
    backgroundColor: colors.surface,
  },
  noteText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },

  sectionTitle: {
    ...type.display,
    color: colors.text,
    fontSize: 18,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },

  grantCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'rgba(255,184,0,0.06)',
    alignItems: 'center',
  },
  grantName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  grantCode: {
    ...type.display,
    color: colors.gold,
    fontSize: 34,
    letterSpacing: 5,
    marginTop: spacing.sm,
  },
  grantHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  grantMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  grantMetaText: { color: colors.textMuted, fontSize: 12 },
  urgent: { color: colors.gold, fontWeight: '700' },

  pastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pastName: { color: colors.textMuted, fontSize: 14 },
  pastMeta: { color: colors.textMuted, fontSize: 12 },
});
