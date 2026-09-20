import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CommandError } from '@odin/contracts';
import { requestSignInCode, verifySignInCode } from '@odin/data';

import { useOdin } from '../src/state/OdinContext.ts';
import { errorMessage } from '../src/components/Banner.tsx';
import { PrimaryButton, SecondaryButton } from '../src/components/Button.tsx';
import { Field } from '../src/components/Field.tsx';
import { Screen } from '../src/components/Screen.tsx';
import { useTheme } from '../src/theme.ts';
import { safeInternalPath } from '../src/routing.ts';

/**
 * One-time code entry. Android autofills an SMS-style code through
 * `autoComplete="one-time-code"`; the value is never written to a log.
 *
 * Resending is rate limited locally by a visible cooldown, which is a
 * usability aid on top of the server's own limit, never a replacement for it.
 */

const RESEND_COOLDOWN_SECONDS = 30;

function useCooldown(): readonly [number, () => void] {
  const [remaining, setRemaining] = useState(RESEND_COOLDOWN_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setRemaining((current) => (current <= 0 ? 0 : current - 1));
    }, 1000);
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, []);

  const restart = useCallback(() => setRemaining(RESEND_COOLDOWN_SECONDS), []);
  return [remaining, restart];
}

export default function VerifyCodeScreen(): ReactNode {
  const { t, client } = useOdin();
  const theme = useTheme();
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const email = params.email ?? '';

  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const [remaining, restartCooldown] = useCooldown();

  const submit = (): void => {
    if (code.trim().length === 0) return;
    setPending(true);
    setError(null);
    verifySignInCode(client, email, code.trim())
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.replace(safeInternalPath(params.next));
      })
      .catch(() => setError({ code: 'UNKNOWN', message_key: 'error.unknown' }))
      .finally(() => setPending(false));
  };

  const resend = (): void => {
    restartCooldown();
    setError(null);
    void requestSignInCode(client, email).then((result) => {
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <Screen title={t('auth.sign_in.title')}>
      <View style={styles.form}>
        <Text style={{ color: theme.colors.textMuted }}>{t('auth.code.sent', { email })}</Text>

        {error !== null && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {errorMessage(error, t)}
          </Text>
        )}

        <Field
          autoComplete="one-time-code"
          inputMode="numeric"
          keyboardType="number-pad"
          label={t('auth.code.label')}
          onChangeText={setCode}
          textContentType="oneTimeCode"
          value={code}
        />

        <PrimaryButton
          disabled={code.trim().length === 0}
          label={pending ? t('auth.signing_in') : t('auth.code.verify')}
          onPress={submit}
          pending={pending}
        />

        <SecondaryButton
          disabled={remaining > 0}
          label={
            remaining > 0 ? t('auth.code.resend_in', { seconds: remaining }) : t('auth.code.resend')
          }
          onPress={resend}
        />

        <SecondaryButton label={t('auth.code.change_email')} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
