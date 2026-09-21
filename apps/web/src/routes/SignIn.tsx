import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { signInWithPassword, resendConfirmation } from '@odin/data';
import { useOdin } from '../app/OdinContext.ts';
import { AuthShell, EmailField, PasswordField, useAuthRequest } from '../components/AuthForm.tsx';
import { safeAuthDestination } from '../routing.ts';
import { setRecoveryUser } from '../auth-links.ts';

export function SignIn(): ReactNode {
  const { client, t, user, authReady } = useOdin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = safeAuthDestination(params.get('next'));
  const invalidLink = params.has('authError');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resent, setResent] = useState(false);
  const request = useAuthRequest();
  useEffect(() => {
    if (authReady && user !== null && !invalidLink) void navigate(destination, { replace: true });
  }, [authReady, user, destination, invalidLink, navigate]);

  async function login(): Promise<void> {
    const result = await request.run(() => signInWithPassword(client, email, password));
    if (result !== null) setPassword('');
    if (result?.ok) {
      setRecoveryUser(null);
      await navigate(destination, { replace: true });
    }
  }
  async function resend(): Promise<void> {
    const result = await request.run(
      () => resendConfirmation(client, email, `${window.location.origin}/auth/confirmed`),
      true,
    );
    if (result?.ok) setResent(true);
  }
  return (
    <AuthShell title={t('auth.sign_in.title')} error={request.error}>
      {invalidLink && <p role="alert">{t('auth.password.invalid_link')}</p>}
      <p>{t('auth.password.intro')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void login();
        }}
      >
        <EmailField value={email} onChange={setEmail} disabled={request.pending} />
        <PasswordField value={password} onChange={setPassword} disabled={request.pending} />
        <button className="button button--primary" disabled={request.disabled} type="submit">
          {t(request.pending ? 'auth.password.working' : 'auth.password.sign_in')}
        </button>
      </form>
      {request.error?.message_key === 'auth.password.unconfirmed' && (
        <button
          className="button"
          type="button"
          disabled={request.disabled || request.cooldown > 0}
          onClick={() => void resend()}
        >
          {t('auth.password.resend')}
        </button>
      )}
      {resent && <p role="status">{t('auth.password.check_inbox')}</p>}
      <p>
        <Link to="/forgot-password">{t('auth.password.forgot')}</Link>
      </p>
      <p>
        <Link to={`/register?next=${encodeURIComponent(destination)}`}>
          {t('auth.password.register')}
        </Link>
      </p>
      <p>{t('auth.password.existing_otp')}</p>
    </AuthShell>
  );
}
