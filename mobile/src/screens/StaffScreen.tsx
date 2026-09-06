import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import type { RedeemResult, Venue } from '../lib/types';
import { colors, radius, spacing, type } from '../theme';
import { PrimaryButton } from '../components/form';
import { EmptyState, LoadingState } from '../components/states';

/**
 * Every refusal gets its own sentence. In a dark, loud room a staff member has
 * a couple of seconds to read this and say something to a customer, so
 * "invalid" is useless — they need to know whether to send the person away,
 * ask them to buy something, or come back on Tuesday.
 */
const REASONS: Record<string, { title: string; detail: string }> = {
  not_found: { title: 'Code not recognised', detail: 'Check the code and try again.' },
  already_redeemed: { title: 'Already used', detail: 'This code was redeemed before. Do not serve it again.' },
  expired: { title: 'Expired', detail: 'This reward is past its expiry date.' },
  voided: { title: 'Cancelled', detail: 'This reward was cancelled by a manager.' },
  blackout_window: { title: 'Not right now', detail: 'This reward cannot be used during peak hours. It works on a quieter night.' },
  purchase_required: { title: 'Needs a purchase', detail: 'This one comes with any purchase. Ring up their order, then scan again.' },
  visit_limit_reached: { title: 'Already claimed tonight', detail: 'One reward per visit. They can use another on their next visit.' },
  not_valid_at_this_venue: { title: 'Wrong venue', detail: 'This reward can only be used at a different location.' },
  staff_not_authorised_at_venue: { title: 'Not your venue', detail: 'You are not assigned to this venue. Ask a manager.' },
  user_banned: { title: 'Account suspended', detail: 'Ask a manager before serving.' },
  staff_banned: { title: 'Your account is suspended', detail: 'Speak to a manager.' },
  operation_key_reused: { title: 'Try again', detail: 'Something went out of step. Start the scan again.' },
  not_authenticated: { title: 'Signed out', detail: 'Sign in again to keep redeeming.' },
};

export function StaffScreen() {
  const insets = useSafeAreaInsets();
  const { isStaff, loading: sessionLoading, userId } = useSession();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [purchaseMade, setPurchaseMade] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<{ id: string; terms_reward_name: string; redeemed_at: string }[]>([]);

  // One key per attempt. If the response is lost, retrying with the same key
  // returns the original receipt instead of a bare "already redeemed", which is
  // the difference between "I did this" and "someone beat me to it".
  const operationKey = useRef<string>(Crypto.randomUUID());

  const loadVenues = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('venue_staff')
      .select('venue_id, venues(*)')
      .eq('user_id', userId)
      .is('revoked_at', null);

    const list = (data ?? [])
      .map((row) => (row as unknown as { venues: Venue | null }).venues)
      .filter((v): v is Venue => Boolean(v));

    setVenues(list);
    setVenueId((current) => current ?? list[0]?.id ?? null);
  }, [userId]);

  const loadToday = useCallback(async () => {
    if (!userId) return;
    const since = new Date();
    since.setHours(since.getHours() - 12);

    const { data } = await supabase
      .from('reward_grants')
      .select('id, terms_reward_name, redeemed_at')
      .eq('redeemed_by_staff_id', userId)
      .gte('redeemed_at', since.toISOString())
      .order('redeemed_at', { ascending: false });

    setToday((data ?? []) as typeof today);
  }, [userId]);

  useEffect(() => {
    void loadVenues();
    void loadToday();
  }, [loadVenues, loadToday]);

  if (sessionLoading) return <LoadingState label="Checking access" />;

  // Hiding this is a courtesy. redeem_code checks venue assignment server-side,
  // so a non-staff account calling it directly is refused regardless.
  if (!isStaff) {
    return (
      <EmptyState
        title="Staff only"
        body="This is the redemption scanner for lounge staff. If you should have access, ask a manager."
      />
    );
  }

  const submit = async () => {
    if (!venueId) return;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setBusy(true);
    setResult(null);

    const { data, error } = await supabase.rpc('redeem_code', {
      code: trimmed,
      at_venue: venueId,
      purchase_made: purchaseMade,
      operation_key: operationKey.current,
    });

    setBusy(false);

    if (error) {
      setResult({ ok: false, reason: 'network' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const outcome = data as RedeemResult;
    setResult(outcome);
    void Haptics.notificationAsync(
      outcome.ok
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );

    if (outcome.ok) await loadToday();
  };

  const reset = () => {
    setCode('');
    setPurchaseMade(false);
    setResult(null);
    operationKey.current = Crypto.randomUUID();
  };

  if (result) {
    const known = !result.ok ? REASONS[result.reason] : null;
    return (
      <View
        style={[
          styles.resultScreen,
          { paddingTop: insets.top + spacing.xxl, backgroundColor: result.ok ? colors.success : colors.danger },
        ]}
      >
        <Text style={styles.resultHeadline}>{result.ok ? 'SERVE IT' : 'DO NOT SERVE'}</Text>

        {result.ok ? (
          <>
            <Text style={styles.resultDetail}>{result.reward_name}</Text>
            {result.requires_purchase ? (
              <Text style={styles.resultNote}>Only with a purchase — confirm their order first.</Text>
            ) : null}
            {result.replayed ? (
              <Text style={styles.resultNote}>
                You already completed this one. It has not been charged twice.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.resultDetail}>
              {known?.title ?? 'Could not redeem'}
            </Text>
            <Text style={styles.resultNote}>
              {known?.detail ?? 'Check your connection and try again.'}
            </Text>
          </>
        )}

        <View style={styles.resultAction}>
          <PrimaryButton label="Next customer" onPress={reset} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>REDEEM</Text>

      {venues.length > 1 ? (
        <View style={styles.venueRow}>
          {venues.map((venue) => (
            <Pressable
              key={venue.id}
              onPress={() => setVenueId(venue.id)}
              style={[styles.venueChip, venueId === venue.id && styles.venueChipActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.venueLabel, venueId === venue.id && styles.venueLabelActive]}>
                {venue.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Code from their screen</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          placeholder="XXXXXXXX"
          placeholderTextColor={colors.border}
          style={styles.codeInput}
          accessibilityLabel="Redemption code"
        />

        <View style={styles.purchaseRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.purchaseLabel}>They made a purchase</Text>
            <Text style={styles.purchaseHint}>
              Required for most rewards. Only tick this if you rang up an order.
            </Text>
          </View>
          <Switch
            value={purchaseMade}
            onValueChange={setPurchaseMade}
            trackColor={{ true: colors.gold, false: colors.border }}
            thumbColor={colors.text}
          />
        </View>

        <PrimaryButton
          label="Redeem"
          busy={busy}
          disabled={!code.trim() || !venueId}
          onPress={() => void submit()}
        />

        {!venueId ? (
          <Text style={styles.warning}>
            You are not assigned to a venue yet. Ask a manager to add you.
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Your last 12 hours</Text>
      {today.length === 0 ? (
        <Text style={styles.empty}>Nothing redeemed on your account yet.</Text>
      ) : (
        today.map((row) => (
          <View key={row.id} style={styles.historyRow}>
            <Text style={styles.historyName}>{row.terms_reward_name}</Text>
            <Text style={styles.historyTime}>
              {new Date(row.redeemed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...type.display, color: colors.text, fontSize: 26, paddingHorizontal: spacing.md },
  eyebrow: { ...type.eyebrow, color: colors.textMuted, marginBottom: spacing.sm },

  venueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md },
  venueChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  venueChipActive: { borderColor: colors.gold, backgroundColor: 'rgba(255,184,0,0.1)' },
  venueLabel: { color: colors.textMuted, fontSize: 14 },
  venueLabelActive: { color: colors.gold, fontWeight: '700' },

  panel: { margin: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  codeInput: {
    ...type.display,
    color: colors.gold,
    fontSize: 36,
    letterSpacing: 6,
    textAlign: 'center',
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  purchaseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  purchaseLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  purchaseHint: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  warning: { color: colors.danger, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },

  resultScreen: { flex: 1, paddingHorizontal: spacing.lg, alignItems: 'center' },
  resultHeadline: { ...type.display, color: '#0A0A0A', fontSize: 44, textAlign: 'center' },
  resultDetail: {
    color: '#0A0A0A',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  resultNote: {
    color: '#0A0A0A',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: spacing.md,
    opacity: 0.85,
  },
  resultAction: { alignSelf: 'stretch', marginTop: 'auto', marginBottom: spacing.xxl },

  sectionTitle: {
    ...type.display,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: { color: colors.textMuted, fontSize: 14, paddingHorizontal: spacing.md },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyName: { color: colors.text, fontSize: 14 },
  historyTime: { color: colors.textMuted, fontSize: 13 },
});
