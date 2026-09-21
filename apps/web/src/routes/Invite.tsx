import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { keysAffectedByMembershipChange, redeemInvitation, useCommand } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { errorMessage } from '../components/Banner.tsx';
import { captureInviteToken } from '../routing.ts';
import {
  clearPendingInvitation,
  getPendingInvitation,
  rememberInvitation,
} from '../pending-invitation.ts';

/**
 * Invitation redemption. The token arrives in the URL fragment so it never
 * reaches the hosting request path or server logs, and it is stripped from
 * visible history the moment it is captured.
 *
 * A signed-out visitor is sent to sign-in with `/invite` preserved as the
 * destination; the captured token is held in memory across that round trip.
 */

export function Invite(): ReactNode {
  const { t, user, authReady, client } = useOdin();
  const navigate = useNavigate();
  const tokenRef = useRef<string | null>(null);
  const [captured, setCaptured] = useState(false);

  if (tokenRef.current === null && !captured) {
    const capturedToken = captureInviteToken(window.location, window.history);
    if (capturedToken !== null) rememberInvitation(capturedToken);
    tokenRef.current = getPendingInvitation();
  }

  useEffect(() => {
    setCaptured(true);
  }, []);

  const redeem = useCommand(
    (requestId, input: { readonly token: string }) =>
      redeemInvitation(client, requestId, input.token),
    {
      invalidate: keysAffectedByMembershipChange(),
      onSuccess: () => {
        clearPendingInvitation();
        void navigate('/', { replace: true });
      },
    },
  );

  useEffect(() => {
    if (!authReady) return;
    if (user === null) {
      void navigate('/sign-in?next=%2Finvite', { replace: true });
    }
  }, [authReady, user, navigate]);

  const token = tokenRef.current;

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card">{t('invite.checking')}</div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="auth-shell">
        <div className="auth-card">{t('invite.sign_in_first')}</div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('invite.title')}</h1>

        {token === null ? (
          <div className="banner banner--danger" role="alert">
            {t('invite.missing')}
          </div>
        ) : (
          <>
            {redeem.state.error !== null && (
              <div className="banner banner--danger" role="alert">
                {errorMessage(redeem.state.error, t)}
              </div>
            )}
            <button
              className="button button--primary"
              disabled={redeem.state.pending}
              onClick={() => void redeem.run({ token })}
              type="button"
            >
              {redeem.state.pending ? t('invite.joining') : t('invite.accept')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
