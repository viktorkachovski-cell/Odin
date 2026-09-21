import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { commandError } from '@odin/contracts';
import { registerWithPassword, resendConfirmation } from '@odin/data';
import { validateNewPassword } from '@odin/domain';
import { useOdin } from '../app/OdinContext.ts';
import { AuthShell, EmailField, PasswordField, useAuthRequest } from '../components/AuthForm.tsx';
import { safeAuthDestination } from '../routing.ts';

export function Register(): ReactNode {
  const { client, t } = useOdin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = safeAuthDestination(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sent, setSent] = useState(false);
  const request = useAuthRequest();
  const redirectTo = `${window.location.origin}/auth/confirmed`;
  async function register(): Promise<void> {
    const issue = validateNewPassword(password, confirmation);
    if (issue !== null) {
      request.setError(commandError('VALIDATION', issue));
      return;
    }
    const result = await request.run(
      () => registerWithPassword(client, email, password, redirectTo),
      true,
    );
    if (result === null) return;
    setPassword('');
    setConfirmation('');
    if (!result.ok) return;
    if (result.data.confirmationRequired) setSent(true);
    else await navigate(destination, { replace: true });
  }
  return (
    <AuthShell title={t('auth.password.register')} error={request.error}>
      {sent ? (
        <>
          <p role="status">{t('auth.password.check_inbox')}</p>
          <p>{t('auth.password.existing_account')}</p>
          <p>{t('auth.password.reopen_invite')}</p>
          <button
            className="button"
            type="button"
            disabled={request.disabled || request.cooldown > 0}
            onClick={() =>
              void request.run(() => resendConfirmation(client, email, redirectTo), true)
            }
          >
            {request.cooldown > 0
              ? t('auth.code.resend_in', { seconds: request.cooldown })
              : t('auth.password.resend')}
          </button>
          <button
            className="button"
            type="button"
            disabled={request.pending}
            onClick={() => setSent(false)}
          >
            {t('auth.code.change_email')}
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void register();
          }}
        >
          <EmailField value={email} onChange={setEmail} disabled={request.pending} />
          <PasswordField
            value={password}
            onChange={setPassword}
            newPassword
            disabled={request.pending}
          />
          <PasswordField
            value={confirmation}
            onChange={setConfirmation}
            newPassword
            confirmation
            disabled={request.pending}
          />
          <button
            className="button button--primary"
            disabled={request.disabled || request.cooldown > 0}
            type="submit"
          >
            {request.cooldown > 0
              ? t('auth.code.resend_in', { seconds: request.cooldown })
              : t(request.pending ? 'auth.password.working' : 'auth.password.register')}
          </button>
        </form>
      )}
      <p>
        <Link to={`/sign-in?next=${encodeURIComponent(destination)}`}>
          {t('auth.password.sign_in')}
        </Link>
      </p>
      <p>
        <Link to="/forgot-password">{t('auth.password.forgot')}</Link>
      </p>
    </AuthShell>
  );
}
