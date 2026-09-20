import { type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme.ts';

/**
 * A labelled text input. The label is a real element rather than a placeholder,
 * so it survives TalkBack traversal and stays visible while typing.
 */
export function Field({
  label,
  value,
  onChangeText,
  error,
  ...input
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly error?: string | undefined;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'style'>): ReactNode {
  const theme = useTheme();
  const invalid = error !== undefined && error.length > 0;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textMuted}
        {...input}
        onChangeText={onChangeText}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: invalid ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radius.md,
            color: theme.colors.text,
            minHeight: theme.touchTarget,
          },
        ]}
        value={value}
      />
      {invalid && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 13 },
  input: { borderWidth: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10 },
  label: { fontSize: 14, fontWeight: '500' },
  wrapper: { gap: 6 },
});
