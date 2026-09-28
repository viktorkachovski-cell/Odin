import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Locale } from '@odin/i18n';

import { useOdin } from '../state/OdinContext.ts';
import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';

export function LanguageChoice({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: Locale;
  readonly onChange: (next: Locale) => void;
}): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {(['en', 'bg'] as const).map((locale) => {
          const name = t(`locale.${locale}`);
          return (
            <SecondaryButton
              accessibilityLabel={name}
              key={locale}
              label={`${value === locale ? '● ' : '○ '}${name}`}
              onPress={() => onChange(locale)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  row: { flexDirection: 'row', gap: 8 },
});
