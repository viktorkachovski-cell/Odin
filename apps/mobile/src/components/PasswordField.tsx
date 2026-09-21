import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useOdin } from '../state/OdinContext.ts';
import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';
import { Field } from './Field.tsx';

/**
 * A masked password input with a reveal control.
 *
 * Paste and password managers stay enabled -- `importantForAutofill` opts the
 * field into Android's autofill service, and nothing hides the context menu --
 * because blocking either pushes people towards weaker, typeable passwords.
 * The value is only ever held in the calling screen's state: it is never put
 * into a route parameter, SecureStore, AsyncStorage or the query cache.
 */
export function PasswordField({
  label,
  value,
  onChange,
  newPassword = false,
  disabled = false,
  hint,
  error,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Registration and recovery autofill a generated password instead of a saved one. */
  readonly newPassword?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
}): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Field
        autoCapitalize="none"
        autoComplete={newPassword ? 'new-password' : 'current-password'}
        autoCorrect={false}
        editable={!disabled}
        error={error}
        importantForAutofill="yes"
        label={label}
        onChangeText={onChange}
        secureTextEntry={!visible}
        textContentType={newPassword ? 'newPassword' : 'password'}
        value={value}
      />

      {hint !== undefined && (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text>
      )}

      <SecondaryButton
        label={t(visible ? 'auth.password.hide' : 'auth.password.show')}
        onPress={() => setVisible(!visible)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13 },
  wrapper: { gap: 8 },
});
