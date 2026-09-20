import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { progressPercent } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';

/**
 * Active list progress shows the count AND the percentage. The bar is
 * decorative; the numbers carry the meaning.
 */
export function Progress({
  completed,
  total,
  t,
}: {
  readonly completed: number;
  readonly total: number;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  const percent = progressPercent(completed, total);
  const label = t('home.progress', { completed, total, percent });

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View
        accessibilityLabel={label}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}
      >
        <View
          style={[styles.fill, { backgroundColor: theme.colors.accent, width: `${percent}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { height: '100%' },
  label: { fontSize: 13 },
  track: { borderRadius: 999, height: 8, overflow: 'hidden' },
  wrapper: { gap: 6 },
});
