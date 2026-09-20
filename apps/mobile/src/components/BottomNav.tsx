import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';

/**
 * The source specifies a question-mark control for Unassigned and a person
 * control for My Tasks. The icons are kept, but each is labelled in the active
 * language so neither the glyph nor its position has to be decoded.
 */

interface NavItem {
  readonly href: '/' | '/unassigned' | '/my-tasks' | '/settings';
  readonly glyph: string;
  readonly labelKey: TranslationKey;
}

const ITEMS: readonly NavItem[] = [
  { href: '/', glyph: '☰', labelKey: 'nav.home' },
  { href: '/unassigned', glyph: '?', labelKey: 'nav.unassigned' },
  { href: '/my-tasks', glyph: '☺', labelKey: 'nav.my_tasks' },
  { href: '/settings', glyph: '⚙', labelKey: 'nav.settings' },
];

const HIDDEN_OFFSET = 96;

export function BottomNav({
  visible,
  t,
  onFocusEnter,
}: {
  readonly visible: boolean;
  readonly t: Translator;
  readonly onFocusEnter?: (() => void) | undefined;
}): ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : HIDDEN_OFFSET,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

  return (
    <Animated.View
      accessibilityRole="tablist"
      accessibilityLabel={t('nav.primary')}
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: insets.bottom,
          transform: [{ translateY }],
        },
      ]}
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const label = t(item.labelKey);
        return (
          // Focus entering the navigation reveals it, per the source behaviour.
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.href}
            onFocus={onFocusEnter}
            onPress={() => router.navigate(item.href)}
            style={[styles.item, { minHeight: theme.touchTarget }]}
          >
            <Text
              style={[
                styles.glyph,
                { color: active ? theme.colors.accent : theme.colors.textMuted },
              ]}
            >
              {item.glyph}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: active ? theme.colors.accent : theme.colors.textMuted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

export function NavSpacer(): ReactNode {
  return <View style={styles.spacer} />;
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    paddingTop: 6,
    position: 'absolute',
    right: 0,
  },
  glyph: { fontSize: 20 },
  item: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center', paddingHorizontal: 4 },
  label: { fontSize: 11 },
  spacer: { height: 96 },
});
