import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOdin } from '../state/OdinContext.ts';
import { useTheme } from '../theme.ts';
import { StaleBanner } from './Banner.tsx';

/**
 * Common frame: safe-area insets, themed background and the offline/stale
 * banner every screen has to surface.
 */
export function Screen({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  const { online, realtimeHealthy, lastSyncedAt, t, locale } = useOdin();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={styles.inner}>
        {title !== undefined && (
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
        )}
        <StaleBanner
          lastSyncedAt={lastSyncedAt}
          locale={locale}
          online={online}
          realtimeHealthy={realtimeHealthy}
          t={t}
        />
        {children}
      </View>
    </SafeAreaView>
  );
}

export function LoadingState({ label }: { readonly label: string }): ReactNode {
  const theme = useTheme();
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="text" style={styles.centered}>
      <ActivityIndicator color={theme.colors.accent} />
      <Text style={{ color: theme.colors.textMuted }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { readonly label: string }): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  empty: { fontSize: 15, textAlign: 'center' },
  inner: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 12 },
});
