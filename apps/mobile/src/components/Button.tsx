import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme.ts';

/**
 * Every pressable in the app goes through here so the Android 48dp minimum
 * target and the disabled-while-pending rule are applied in one place rather
 * than re-derived per screen.
 */

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly accessibilityLabel?: string;
}

function ButtonBody({
  label,
  pending,
  color,
}: {
  readonly label: string;
  readonly pending: boolean;
  readonly color: string;
}): ReactNode {
  return (
    <View style={styles.body}>
      {pending && <ActivityIndicator color={color} size="small" />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  pending = false,
  accessibilityLabel,
}: ButtonProps): ReactNode {
  const theme = useTheme();
  const blocked = disabled || pending;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: pending }}
      android_ripple={{ color: theme.colors.border }}
      disabled={blocked}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          minHeight: theme.touchTarget,
          opacity: blocked ? 0.6 : 1,
        },
      ]}
    >
      <ButtonBody color={theme.colors.accentText} label={label} pending={pending} />
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  pending = false,
  accessibilityLabel,
}: ButtonProps): ReactNode {
  const theme = useTheme();
  const blocked = disabled || pending;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: pending }}
      android_ripple={{ color: theme.colors.surfaceMuted }}
      disabled={blocked}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          minHeight: theme.touchTarget,
          opacity: blocked ? 0.6 : 1,
        },
      ]}
    >
      <ButtonBody color={theme.colors.text} label={label} pending={pending} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  body: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
});
