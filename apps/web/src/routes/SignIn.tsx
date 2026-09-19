import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import type { CommandError } from '@odin/contracts';
import { requestSignInCode, verifySignInCode } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { errorMessage } from '../components/Banner.tsx';
import { Field } from '../components/Field.tsx';
import { safeInternalPath } from '../routing.ts';

/**
 * Email one-time-code sign-in. The code and the address are never logged, and
 * the post-sign-in destination is validated as an internal path so an attacker
 * cannot turn `?next=` into an open redirect.
 */

const RESEND_COOLDOWN_SECONDS = 30;

export function SignIn(): ReactNode {
  const { client, t, user, authReady } = useOdin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = safeInternalPath(params.get('next'));

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (authReady && user !== null) {
      void navigate(destination, { replace: true });
    }
  }, [authReady, user, destination, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (): Promise<void> => {
    setPending(true);
    setError(null);
    const result = await requestSignInCode(client, email.trim());
    setPending(false);
    if (result.ok) {
      setStage('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError(result.error);
    }
  };

  const verify = async (): Promise<void> => {
    setPending(true);
    setError(null);
    const result = await verifySignInCode(client, email.trim(), code.trim());
    setPending(false);
    if (result.ok) {
      await navigate(destination, { replace: true });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{t('auth.sign_in.title')}</h1>

        {error !== null && (
          <div className="banner banner--danger" role="alert">
            {errorMessage(error, t)}
          </div>
        )}

        {stage === 'email' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendCode();
            }}
          >
            <p>{t('auth.sign_in.intro')}</p>
            <Field label={t('auth.email.label')}>
              {(props) => (
                <input
                  {...props}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              )}
            </Field>
            <button
              className="button button--primary"
              disabled={pending || email.trim().length === 0}
              type="submit"
            >
              {pending ? t('auth.signing_in') : t('auth.email.send_code')}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            <p>{t('auth.code.sent', { email: email.trim() })}</p>
            <Field label={t('auth.code.label')}>
              {(props) => (
                <input
                  {...props}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  onChange={(event) => setCode(event.target.value)}
                  required
                  type="text"
                  value={code}
                />
              )}
            </Field>
            <div className="dialog__actions">
              <button
                className="button"
                onClick={() => {
                  setStage('email');
                  setCode('');
                  setError(null);
                }}
                type="button"
              >
                {t('auth.code.change_email')}
              </button>
              <button
                className="button"
                disabled={pending || cooldown > 0}
                onClick={() => void sendCode()}
                type="button"
              >
                {cooldown > 0
                  ? t('auth.code.resend_in', { seconds: cooldown })
                  : t('auth.code.resend')}
              </button>
              <button
                className="button button--primary"
                disabled={pending || code.trim().length === 0}
                type="submit"
              >
                {pending ? t('auth.signing_in') : t('auth.code.verify')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
