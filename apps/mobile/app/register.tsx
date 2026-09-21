import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { commandError } from '@odin/contracts';
import { registerWithPassword, resendConfirmation } from '@odin/data';
import { validateNewPassword } from '@odin/domain';

import { useOdin } from '../src/state/OdinContext.ts';
import { useAuthRequest } from '../src/state/useAuthRequest.ts';
import { errorMessage } from '../src/components/Banner.tsx';
import { PrimaryButton, SecondaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { PasswordField } from '../src/components/PasswordField.tsx';
import { Screen } from '../src/components/Screen.tsx';
import { CONFIRMATION_URL } from '../src/auth-urls.ts';
import { safeAuthDestination } from '../src/routing.ts';
import { useTheme } from '../src/theme.ts';

/**
 * Registration. The password pair is checked locally by the shared validator
 * before any request goes out, so an obvious mistake costs no round trip and no
 * email.
 *
 * A duplicate registration is deliberately indistinguishable from a new one --
 * the data layer maps it to the same "check your inbox" result -- so this
 * screen cannot be used to discover which addresses have accounts.
 *
 * Confirming happens in a browser. That keeps bearer tokens out of the
 * `odin://` deep link and works when the mail is opened on another device; the
 * person then returns here and signs in.
 */
export default function RegisterScreen(): ReactNode {
  const { t, online, client } = useOdin();
  const theme = useTheme();
  const params = useLocalSearchParams<{ next?: string }>();
  const destination = safeAuthDestination(params.next);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sent, setSent] = useState(false);
  const request = useAuthRequest();

  const submit = (): void => {
    void (async () => {
      const issue = validateNewPassword(password, confirmation);
      if (issue !== null) {
        request.setError(commandError('VALIDATION', issue));
        return;
      }

      const result = await request.run(
        () => registerWithPassword(client, email, password, CONFIRMATION_URL),
        true,
      );
      if (result === null) return;

      setPassword('');
      setConfirmation('');
      if (!result.ok) return;

      // A local stack without email confirmation hands back a session straight
      // away; the hosted project does not, and must not be changed to.
      if (result.data.confirmationRequired) setSent(true);
      else router.replace(destination);
    })();
  };

  const resend = (): void => {
    void request.run(() => resendConfirmation(client, email, CONFIRMATION_URL), true);
  };

  const toSignIn = (): void =>
    router.replace({ pathname: '/sign-in', params: { next: destination } });

  const ready =
    email.trim().length > 0 && password.length > 0 && confirmation.length > 0 && !request.disabled;

  return (
    <Screen title={t('auth.password.register')}>
      <View style={styles.form}>
        {request.error !== null && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {errorMessage(request.error, t)}
          </Text>
        )}

        {sent ? (
          <>
            <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>
              {t('auth.password.check_inbox')}
            </Text>
            <Text style={{ color: theme.colors.textMuted }}>
              {t('auth.password.browser_confirm')}
            </Text>
            <Text style={{ color: theme.colors.textMuted }}>
              {t('auth.password.existing_account')}
            </Text>
            <Text style={{ color: theme.colors.textMuted }}>
              {t('auth.password.reopen_invite')}
            </Text>

            <SecondaryButton
              disabled={request.disabled || request.cooldown > 0}
              label={
                request.cooldown > 0
                  ? t('auth.code.resend_in', { seconds: request.cooldown })
                  : t('auth.password.resend')
              }
              onPress={resend}
            />

            <PrimaryButton label={t('auth.password.back_to_sign_in')} onPress={toSignIn} />
          </>
        ) : (
          <>
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

            <PasswordField
              disabled={request.pending}
              hint={t('auth.password.hint')}
              label={t('auth.password.label')}
              newPassword
              onChange={setPassword}
              value={password}
            />

            <PasswordField
              disabled={request.pending}
              label={t('auth.password.confirm')}
              newPassword
              onChange={setConfirmation}
              value={confirmation}
            />

            <PrimaryButton
              disabled={!ready || request.cooldown > 0}
              label={
                request.cooldown > 0
                  ? t('auth.code.resend_in', { seconds: request.cooldown })
                  : request.pending
                    ? t('auth.password.working')
                    : t('auth.password.register')
              }
              onPress={submit}
              pending={request.pending}
            />

            <SecondaryButton label={t('auth.password.back_to_sign_in')} onPress={toSignIn} />
          </>
        )}

        {!online && <Text style={{ color: theme.colors.textMuted }}>{t('state.offline')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
