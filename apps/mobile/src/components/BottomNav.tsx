import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { NavIcon, type NavIconName } from './NavIcon.tsx';

/**
 * Four destinations: Today, Tasks (which replaced My Tasks, Unassigned and All
 * tasks), Lists and Settings. Tasks carries the member's open-task count.
 */

interface NavItem {
  readonly href: '/' | '/tasks' | '/lists' | '/settings';
  readonly icon: NavIconName;
  readonly labelKey: TranslationKey;
}

const ITEMS: readonly NavItem[] = [
  { href: '/', icon: 'today', labelKey: 'nav.today' },
  { href: '/tasks', icon: 'tasks', labelKey: 'nav.tasks' },
  { href: '/lists', icon: 'lists', labelKey: 'nav.lists' },
  { href: '/settings', icon: 'settings', labelKey: 'nav.settings' },
];

/** The list detail screen lives under Lists, so the Lists tab stays current there. */
function isActive(href: NavItem['href'], pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/lists') return pathname === '/lists' || pathname.startsWith('/list/');
  return pathname === href;
}

const HIDDEN_OFFSET = 96;

export function BottomNav({
  visible,
  t,
  onFocusEnter,
  badge = 0,
}: {
  readonly visible: boolean;
  readonly t: Translator;
  /** Open tasks assigned to the member, shown on the Tasks tab. */
  readonly badge?: number;
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
        const active = isActive(item.href, pathname);
        const label = t(item.labelKey);
        const color = active ? theme.colors.accent : theme.colors.textMuted;
        const count = item.href === '/tasks' && badge > 0 ? badge : null;
        return (
          // Focus entering the navigation reveals it, per the source behaviour.
          <Pressable
            accessibilityLabel={count === null ? label : `${label}, ${String(count)}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.href}
            onFocus={onFocusEnter}
            onPress={() => router.navigate(item.href)}
            style={[styles.item, { minHeight: theme.touchTarget }]}
          >
            <View
              style={[
                styles.pill,
                { borderRadius: theme.radius.pill },
                active && { backgroundColor: theme.colors.accentSoft },
              ]}
            >
              <NavIcon color={color} name={item.icon} />
              {count !== null && (
                <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
                  <Text style={[styles.badgeText, { color: theme.colors.accentText }]}>
                    {count}
                  </Text>
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={[styles.label, { color }, active && styles.labelActive]}>
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
  badge: {
    alignItems: 'center',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 6,
    top: -4,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  labelActive: { fontWeight: '700' },
  pill: { alignItems: 'center', height: 30, justifyContent: 'center', width: 56 },
  item: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center', paddingHorizontal: 4 },
  label: { fontSize: 12 },
  spacer: { height: 96 },
});
