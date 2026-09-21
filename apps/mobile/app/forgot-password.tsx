import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { requestPasswordReset } from '@odin/data';

import { useOdin } from '../src/state/OdinContext.ts';
import { useAuthRequest } from '../src/state/useAuthRequest.ts';
import { errorMessage } from '../src/components/Banner.tsx';
import { PrimaryButton, SecondaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { FormScreen as Screen } from '../src/components/FormScreen.tsx';
import { safeAuthDestination } from '../src/routing.ts';
import { RECOVERY_URL } from '../src/auth-urls.ts';
import { useTheme } from '../src/theme.ts';

/**
 * Password recovery request.
 *
 * The acknowledgement is deliberately the same whether or not an account
 * exists, so this screen cannot be used to enumerate addresses. It is also the
 * route an account created under the old one-time-code sign-in takes to gain a
 * password: recovery keeps the same user, profile and household, where
 * registering again would not.
 *
 * The link sets the password in a browser. Android needs no native reset form
 * in this baseline, which is what keeps recovery tokens out of the app's deep
 * link handler.
 */
export default function ForgotPasswordScreen(): ReactNode {
  const { t, online, client } = useOdin();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const request = useAuthRequest();
  const params = useLocalSearchParams<{ next?: string }>();
  const destination = safeAuthDestination(params.next);

  const submit = (): void => {
    void (async () => {
      const result = await request.run(
        () => requestPasswordReset(client, email, RECOVERY_URL),
        true,
      );
      if (result?.ok === true) setSent(true);
    })();
  };

  return (
    <Screen title={t('auth.password.forgot')}>
      <View style={styles.form}>
        <Text style={{ color: theme.colors.textMuted }}>{t('auth.password.recovery_intro')}</Text>
        <Text style={{ color: theme.colors.textMuted }}>{t('auth.password.browser_reset')}</Text>

        {request.error !== null && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {errorMessage(request.error, t)}
          </Text>
        )}

        {sent && (
          <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>
            {t('auth.password.reset_sent')}
          </Text>
        )}

        <Field
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!request.pending}
          inputMode="email"
          keyboardType="email-address"
          label={t('auth.email.label')}
          onChangeText={setEmail}
          textContentType="emailAddress"
          value={email}
        />

        <PrimaryButton
          disabled={request.disabled || request.cooldown > 0 || email.trim().length === 0}
          label={
            request.cooldown > 0
              ? t('auth.code.resend_in', { seconds: request.cooldown })
              : request.pending
                ? t('auth.password.working')
                : t('auth.password.send_reset')
          }
          onPress={submit}
          pending={request.pending}
        />

        <SecondaryButton
          disabled={request.pending}
          label={t('auth.password.back_to_sign_in')}
          onPress={() => router.replace({ pathname: '/sign-in', params: { next: destination } })}
        />

        {!online && <Text style={{ color: theme.colors.textMuted }}>{t('state.offline')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
