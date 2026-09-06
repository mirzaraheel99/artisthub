import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import {
  clearPendingReferral,
  normalizeCode,
  readPendingReferral,
  watchForReferral,
} from '../lib/referral';
import { colors, radius, spacing, type } from '../theme';
import { FormError, PrimaryButton, TextButton, TextField } from '../components/form';

type Mode = 'signup' | 'signin';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();

  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A code captured from a link before the account existed. It survives the
  // trip to the store and a restart, which is the whole point of holding it
  // locally rather than in memory.
  useEffect(() => {
    void readPendingReferral().then((code) => {
      if (code) setReferralCode(code);
    });
    return watchForReferral(setReferralCode);
  }, []);

  const codeError =
    referralCode.trim() && !normalizeCode(referralCode)
      ? "That code doesn't look right. Check it, or leave it blank."
      : null;

  const submit = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are both required.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (codeError) {
      setError(codeError);
      return;
    }

    setBusy(true);

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(friendly(err.message));
        setBusy(false);
        return;
      }
    } else {
      // The referral code travels as signup metadata and is attached inside the
      // database trigger. A second call afterwards could be skipped, replayed,
      // or pointed at a different referrer.
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: name.trim() || null,
            referral_code: normalizeCode(referralCode) ?? null,
          },
        },
      });
      if (err) {
        setError(friendly(err.message));
        setBusy(false);
        return;
      }
      await clearPendingReferral();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    await refresh();
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.wordmark}>ARTIST HUB</Text>
        <Text style={styles.tagline}>
          {mode === 'signup'
            ? 'Follow the roster, bring your people, eat free.'
            : 'Welcome back.'}
        </Text>

        {referralCode && mode === 'signup' ? (
          <View style={styles.referralBanner}>
            <Text style={styles.referralTitle}>You were invited</Text>
            <Text style={styles.referralBody}>
              Code <Text style={styles.referralCode}>{referralCode.toUpperCase()}</Text> is attached
              to your account. Claim your welcome offer at the lounge and your friend gets credit.
            </Text>
          </View>
        ) : null}

        <View style={styles.form}>
          {error ? <FormError message={error} /> : null}

          {mode === 'signup' ? (
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="name"
              placeholder="What should we call you?"
            />
          ) : null}

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
          />

          {mode === 'signup' ? (
            <TextField
              label="Referral code (optional)"
              value={referralCode}
              onChangeText={setReferralCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              error={codeError}
              placeholder="From a friend"
            />
          ) : null}

          <View style={{ marginTop: spacing.sm }}>
            <PrimaryButton
              label={mode === 'signup' ? 'Create account' : 'Sign in'}
              busy={busy}
              onPress={() => void submit()}
            />
          </View>

          <TextButton
            label={
              mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'New here? Create an account'
            }
            onPress={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setError(null);
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Auth errors are written for developers. These are the ones users actually
 *  hit, rewritten to say what to do next. */
function friendly(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login')) return 'That email and password combination is not right.';
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'There is already an account with that email. Try signing in instead.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return message;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },
  wordmark: { ...type.display, color: colors.gold, fontSize: 30, letterSpacing: 2 },
  tagline: { color: colors.textMuted, fontSize: 15, marginTop: spacing.sm, lineHeight: 21 },

  referralBanner: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.purple,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  referralTitle: { ...type.eyebrow, color: colors.purple },
  referralBody: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  referralCode: { fontWeight: '800', color: colors.gold },

  form: { marginTop: spacing.xl },
});
