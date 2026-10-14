import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { NavIcon, type NavIconName } from './NavIcon.tsx';
import { useNavBarHeight } from './layout.ts';

/** Four destinations: Today, Tasks, Lists and Settings. Tasks carries the member's open-task count. */

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

export function BottomNav({
  t,
  badge = 0,
}: {
  readonly t: Translator;
  /** Open tasks assigned to the member, shown on the Tasks tab. */
  readonly badge?: number;
}): ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const height = useNavBarHeight();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('nav.primary')}
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: insets.bottom,
          height: height + insets.bottom,
        },
      ]}
    >
      {ITEMS.map((item) => {
        const active = isActive(item.href, pathname);
        const label = t(item.labelKey);
        const color = active ? theme.colors.accent : theme.colors.textMuted;
        const count = item.href === '/tasks' && badge > 0 ? badge : null;
        return (
          <Pressable
            accessibilityLabel={count === null ? label : `${label}, ${String(count)}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.href}
            onPress={() => {
              Keyboard.dismiss();
              router.navigate(item.href);
            }}
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
    </View>
  );
}

export function NavSpacer(): ReactNode {
  const height = useNavBarHeight();
  const insets = useSafeAreaInsets();
  return <View style={{ height: height + insets.bottom + 80 }} />;
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
    minHeight: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: 'absolute',
    right: 6,
    top: -4,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  labelActive: { fontWeight: '700' },
  pill: { alignItems: 'center', height: 30, justifyContent: 'center', width: 56 },
  item: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center', paddingHorizontal: 4 },
  label: { fontSize: 12 },
});
