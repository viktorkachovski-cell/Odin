import { router } from 'expo-router';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { keysAffectedByMembershipChange, redeemInvitation, useCommand } from '@odin/data';

import { useOdin } from '../src/state/OdinContext.ts';
import { ErrorBanner } from '../src/components/Banner.tsx';
import { PrimaryButton } from '../src/components/Button.tsx';
import { LoadingState, Screen } from '../src/components/Screen.tsx';
import {
  clearPendingInvitation,
  getPendingInvitation,
  subscribeInvitation,
} from '../src/state/pending-invitation.ts';

/**
 * Invitation redemption. The token travels in the deep link's fragment so it
 * never reaches a hosting request path or server log, and it is held only in
 * memory -- never persisted, never rendered, never logged.
 *
 * A signed-out visitor is sent to sign-in with `/invite` preserved as the
 * destination. The token survives that round trip -- and the registration and
 * browser-confirmation detour -- in `pending-invitation`, which holds it in
 * memory only. Confirming an email never redeems an invitation or creates a
 * household on its own; the person still presses Join here.
 */

export default function InviteScreen(): ReactNode {
  const { t, user, authReady, client, online } = useOdin();
  const token = useSyncExternalStore(subscribeInvitation, getPendingInvitation);

  useEffect(() => {
    if (!authReady || user !== null) return;
    router.replace({ pathname: '/sign-in', params: { next: '/invite' } });
  }, [authReady, user]);

  const redeem = useCommand(
    (requestId, input: { readonly token: string }) =>
      redeemInvitation(client, requestId, input.token),
    {
      invalidate: keysAffectedByMembershipChange(),
      onSuccess: () => {
        clearPendingInvitation();
        router.replace('/');
      },
    },
  );

  if (!authReady) return <LoadingState label={t('state.loading')} />;
  if (user === null) return <LoadingState label={t('invite.sign_in_first')} />;

  if (token === null) {
    return (
      <Screen title={t('invite.title')}>
        <Text>{t('invite.missing')}</Text>
        <Text>{t('auth.password.reopen_invite')}</Text>
      </Screen>
    );
  }

  return (
    <Screen title={t('invite.title')}>
      <View style={styles.form}>
        {redeem.state.error !== null && (
          <ErrorBanner
            error={redeem.state.error}
            onRetry={redeem.state.error.code === 'NETWORK' ? () => void redeem.retry() : undefined}
            t={t}
          />
        )}
        <PrimaryButton
          disabled={!online}
          label={redeem.state.pending ? t('invite.joining') : t('invite.accept')}
          onPress={() => void redeem.run({ token })}
          pending={redeem.state.pending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});
