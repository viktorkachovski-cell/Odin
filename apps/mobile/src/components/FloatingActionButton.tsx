import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme.ts';

/** Android extended FAB for the primary create action on a screen. */
export function FloatingActionButton({
  label,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}): ReactNode {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={{ color: theme.colors.border }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.fab,
        {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.lg,
          bottom: 88 + insets.bottom,
          minHeight: 56,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.plus, { color: theme.colors.accentText }]}>＋</Text>
      <Text numberOfLines={1} style={[styles.label, { color: theme.colors.accentText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 16,
    shadowColor: '#000000',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 4,
    zIndex: 5,
  },
  label: { fontSize: 15, fontWeight: '700' },
  plus: { fontSize: 22, lineHeight: 24 },
});
