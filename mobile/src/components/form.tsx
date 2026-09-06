import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export const TextField = forwardRef<TextInput, TextInputProps & { label: string; error?: string | null }>(
  ({ label, error, style, ...rest }, ref) => (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, !!error && styles.inputError, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  ),
);
TextField.displayName = 'TextField';

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.primary, inactive && styles.inactive, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryLabel}>{label}</Text>}
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.textButton} hitSlop={8}>
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <View style={styles.formError}>
      <Text style={styles.formErrorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: { ...type.eyebrow, color: colors.textMuted, marginBottom: spacing.sm },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },

  primary: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  primaryLabel: { color: colors.bg, fontSize: 16, fontWeight: '800' },

  textButton: { alignSelf: 'center', paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { color: colors.textMuted, fontSize: 14 },

  formError: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formErrorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
