import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../lib/session';
import { AuthScreen } from './AuthScreen';
import { colors, radius, spacing, type } from '../theme';
import { LoadingState } from '../components/states';
import { PrimaryButton } from '../components/form';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, roles, userId, loading, signOut } = useSession();

  if (loading) return <LoadingState label="Loading" />;
  if (!userId) return <AuthScreen />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
    >
      <Text style={styles.title}>PROFILE</Text>

      <View style={styles.card}>
        <Row label="Name" value={profile?.display_name ?? 'Not set'} />
        <Row label="Email" value={profile?.email ?? '—'} />
        <Row label="Referral code" value={profile?.referral_code ?? '—'} mono />
        <Row
          label="Phone"
          value={profile?.phone_verified_at ? 'Verified' : 'Not verified'}
        />
        {roles.length > 1 ? <Row label="Access" value={roles.join(', ')} /> : null}
      </View>

      <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.xl }}>
        <PrimaryButton label="Sign out" onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...type.display, color: colors.text, fontSize: 26, paddingHorizontal: spacing.md },
  card: {
    margin: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  mono: { letterSpacing: 2, color: colors.gold },
});
