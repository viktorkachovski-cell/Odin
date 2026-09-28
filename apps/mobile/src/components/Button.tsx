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

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  body: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
});
