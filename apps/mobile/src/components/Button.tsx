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

function Button({
  primary,
  label,
  onPress,
  disabled = false,
  pending = false,
  accessibilityLabel,
}: ButtonProps & { readonly primary: boolean }): ReactNode {
  const theme = useTheme();
  const blocked = disabled || pending;
  const color = primary ? theme.colors.accentText : theme.colors.text;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: pending }}
      android_ripple={{ color: primary ? theme.colors.border : theme.colors.surfaceMuted }}
      disabled={blocked}
      onPress={onPress}
      style={[
        styles.base,
        primary
          ? { backgroundColor: theme.colors.accent }
          : {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: 1,
            },
        { borderRadius: theme.radius.md, minHeight: theme.touchTarget, opacity: blocked ? 0.6 : 1 },
      ]}
    >
      <View style={styles.body}>
        {pending && <ActivityIndicator color={color} size="small" />}
        <Text style={[styles.label, { color }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps): ReactNode {
  return <Button {...props} primary />;
}

export function SecondaryButton(props: ButtonProps): ReactNode {
  return <Button {...props} primary={false} />;
}

/** An outlined accent action inside a row, such as Claim or Use template. */
export function AccentButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: Omit<ButtonProps, 'pending'>): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={{ color: theme.colors.accentSoft }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.accent,
        {
          borderColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          minHeight: theme.touchTarget,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.accentLabel, { color: theme.colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accent: {
    alignItems: 'center',
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  accentLabel: { flexShrink: 1, fontSize: 14, fontWeight: '700' },
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  body: { alignItems: 'center', flexDirection: 'row', gap: 8, maxWidth: '100%' },
  label: { flexShrink: 1, fontSize: 16, fontWeight: '500', textAlign: 'center' },
});
