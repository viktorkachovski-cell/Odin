import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';

/** A labelled single choice, drawn as a wrapping row of marked buttons. */
export function ChoiceGroup<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { readonly key: K; readonly label: string }[];
  readonly value: K;
  readonly onChange: (next: K) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {options.map((option) => (
          <SecondaryButton
            accessibilityLabel={option.label}
            key={option.key}
            label={`${value === option.key ? '● ' : '○ '}${option.label}`}
            onPress={() => onChange(option.key)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
