import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { resendConfirmation, signInWithPassword } from '@odin/data';

import { useOdin } from '../src/state/OdinContext.ts';
import { useAuthRequest } from '../src/state/useAuthRequest.ts';
import { errorMessage } from '../src/components/Banner.tsx';
import { PrimaryButton, SecondaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { PasswordField } from '../src/components/PasswordField.tsx';
import { FormScreen as Screen } from '../src/components/FormScreen.tsx';
import { CONFIRMATION_URL } from '../src/auth-urls.ts';
import { safeAuthDestination } from '../src/routing.ts';
import { useTheme } from '../src/theme.ts';

/**
 * Email and password sign-in.
 *
 * No password policy is applied here: an account created before the minimum
 * length existed must still be able to log in, so the server is the only judge
 * of an existing password. The address is trimmed, the password never is.
 *
 * Neither value is logged, and the password is dropped from state as soon as
 * the request settles, so it cannot be read back off a suspended screen.
 */
export default function SignInScreen(): ReactNode {
  const { t, online, client, user, authReady } = useOdin();
  const theme = useTheme();
  const params = useLocalSearchParams<{ next?: string }>();
  const destination = safeAuthDestination(params.next);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resent, setResent] = useState(false);
  // Latched rather than read off the live error: starting the resend clears the
  // error, which would otherwise take the resend control and its cooldown with it.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const request = useAuthRequest();

  // A session restored from the keystore while this screen is showing means the
  // person is already signed in; there is nothing to ask them for.
  useEffect(() => {
    if (authReady && user !== null) router.replace(destination);
  }, [authReady, user, destination]);

  const submit = (): void => {
    void (async () => {
      const result = await request.run(() => signInWithPassword(client, email, password));
      if (result === null) return;
      setPassword('');
      if (result.ok) {
        router.replace(destination);
        return;
      }
      setUnconfirmed(result.error.message_key === 'auth.password.unconfirmed');
    })();
  };

  const resend = (): void => {
    void (async () => {
      const result = await request.run(
        () => resendConfirmation(client, email, CONFIRMATION_URL),
        true,
      );
      if (result?.ok === true) setResent(true);
    })();
  };

  // A different address deserves a fresh verdict from the server.
  const changeEmail = (next: string): void => {
    setEmail(next);
    setUnconfirmed(false);
    setResent(false);
  };

  const ready = email.trim().length > 0 && password.length > 0;

  return (
    <Screen title={t('auth.sign_in.title')}>
      <View style={styles.form}>
        <Text style={{ color: theme.colors.textMuted }}>{t('auth.password.intro')}</Text>

        {request.error !== null && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {errorMessage(request.error, t)}
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
          onChangeText={changeEmail}
          textContentType="emailAddress"
          value={email}
        />

        <PasswordField
          disabled={request.pending}
          label={t('auth.password.label')}
          onChange={setPassword}
          value={password}
        />

        <PrimaryButton
          disabled={request.disabled || !ready}
          label={request.pending ? t('auth.password.working') : t('auth.password.sign_in')}
          onPress={submit}
          pending={request.pending}
        />

        {unconfirmed && (
          <SecondaryButton
            disabled={request.disabled || request.cooldown > 0}
            label={
              request.cooldown > 0
                ? t('auth.code.resend_in', { seconds: request.cooldown })
                : t('auth.password.resend')
            }
            onPress={resend}
          />
        )}

        {resent && (
          <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>
            {t('auth.password.check_inbox')}
          </Text>
        )}

        <SecondaryButton
          disabled={request.pending}
          label={t('auth.password.register')}
          onPress={() => router.push({ pathname: '/register', params: { next: destination } })}
        />

        <SecondaryButton
          disabled={request.pending}
          label={t('auth.password.forgot')}
          onPress={() =>
            router.push({ pathname: '/forgot-password', params: { next: destination } })
          }
        />

        <Text style={{ color: theme.colors.textMuted }}>{t('auth.password.existing_otp')}</Text>

        {!online && <Text style={{ color: theme.colors.textMuted }}>{t('state.offline')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
