import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CommandError } from '@odin/contracts';
import { requestSignInCode } from '@odin/data';

import { useOdin } from '../src/state/OdinContext.ts';
import { errorMessage } from '../src/components/Banner.tsx';
import { PrimaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { Screen } from '../src/components/Screen.tsx';
import { useTheme } from '../src/theme.ts';

/**
 * Email one-time code request. The address and the code are never logged, and
 * the intended destination survives the round trip so a deep link still lands
 * where the person meant to go.
 */

export default function SignInScreen(): ReactNode {
  const { t, online, client } = useOdin();
  const theme = useTheme();
  const params = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);

  const submit = (): void => {
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    setPending(true);
    setError(null);
    requestSignInCode(client, trimmed)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push({
          pathname: '/verify-code',
          params: { email: trimmed, ...(params.next === undefined ? {} : { next: params.next }) },
        });
      })
      .catch(() => setError({ code: 'UNKNOWN', message_key: 'error.unknown' }))
      .finally(() => setPending(false));
  };

  return (
    <Screen title={t('auth.sign_in.title')}>
      <View style={styles.form}>
        <Text style={{ color: theme.colors.textMuted }}>{t('auth.sign_in.intro')}</Text>

        {error !== null && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {errorMessage(error, t)}
          </Text>
        )}

        <Field
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          keyboardType="email-address"
          label={t('auth.email.label')}
          onChangeText={setEmail}
          textContentType="emailAddress"
          value={email}
        />

        <PrimaryButton
          disabled={!online || email.trim().length === 0}
          label={pending ? t('auth.signing_in') : t('auth.email.send_code')}
          onPress={submit}
          pending={pending}
        />

        {!online && <Text style={{ color: theme.colors.textMuted }}>{t('state.offline')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
