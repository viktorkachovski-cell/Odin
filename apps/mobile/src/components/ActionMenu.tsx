import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme.ts';

/** A sheet over a dimmed backdrop; a tap outside, Back or TalkBack escape closes it. */
export function MenuSheet({
  open,
  onClose,
  animation = 'fade',
  style,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly animation?: 'fade' | 'slide';
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}): ReactNode {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType={animation} onRequestClose={onClose} transparent visible={open}>
      <Pressable accessible={false} onPress={onClose} style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          onStartShouldSetResponder={() => true}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            style,
          ]}
        >
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

export interface ActionMenuItem {
  readonly label: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
}

/**
 * Compact Android overflow action. Secondary actions open in a bottom menu so
 * task cards stay readable on narrow screens and with large system text.
 */
export function ActionMenu({
  accessibilityLabel,
  actions,
  disabled = false,
}: {
  readonly accessibilityLabel: string;
  readonly actions: readonly ActionMenuItem[];
  readonly disabled?: boolean;
}): ReactNode {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        android_ripple={{ color: theme.colors.surfaceMuted, borderless: true }}
        disabled={disabled}
        hitSlop={4}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            borderRadius: theme.radius.pill,
            minHeight: theme.touchTarget,
            minWidth: theme.touchTarget,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[styles.triggerText, { color: theme.colors.text }]}>⋮</Text>
      </Pressable>

      <MenuSheet onClose={() => setOpen(false)} open={open} style={styles.menu}>
        <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
        {actions.map((action) => (
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: theme.colors.surfaceMuted }}
            key={action.label}
            onPress={() => {
              setOpen(false);
              action.onPress();
            }}
            style={[styles.action, { minHeight: theme.touchTarget }]}
          >
            <Text
              style={[
                styles.actionText,
                { color: action.destructive === true ? theme.colors.danger : theme.colors.text },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </MenuSheet>
    </>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'center', paddingHorizontal: 20 },
  actionText: { fontSize: 16, fontWeight: '500' },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 8, width: 32 },
  menu: { gap: 2, paddingTop: 10 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
  trigger: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  triggerText: { fontSize: 26, lineHeight: 30 },
});
