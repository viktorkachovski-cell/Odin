import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  backLabel,
  onBack,
}: {
  readonly children: ReactNode;
  readonly title?: string | undefined;
  readonly backLabel?: string | undefined;
  readonly onBack?: (() => void) | undefined;
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
          <View style={styles.topBar}>
            {onBack !== undefined && (
              <Pressable
                accessibilityLabel={backLabel ?? title}
                accessibilityRole="button"
                android_ripple={{ color: theme.colors.surfaceMuted, borderless: true }}
                hitSlop={4}
                onPress={onBack}
                style={[
                  styles.back,
                  {
                    borderRadius: theme.radius.pill,
                    minHeight: theme.touchTarget,
                    minWidth: theme.touchTarget,
                  },
                ]}
              >
                <Text style={[styles.backGlyph, { color: theme.colors.text }]}>‹</Text>
              </Pressable>
            )}
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[styles.title, { color: theme.colors.text }]}
            >
              {title}
            </Text>
          </View>
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
  back: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backGlyph: { fontSize: 36, lineHeight: 38 },
  empty: { fontSize: 15, textAlign: 'center' },
  inner: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  title: { flex: 1, fontSize: 24, fontWeight: '700' },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 12, minHeight: 48 },
});
