import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { commandError } from '@odin/contracts';
import { requestPasswordReset, updatePassword } from '@odin/data';
import { validateNewPassword } from '@odin/domain';
import { useOdin } from '../app/OdinContext.ts';
import { isRecoveryUser, setRecoveryUser } from '../auth-links.ts';
import { AuthShell, EmailField, PasswordField, useAuthRequest } from '../components/AuthForm.tsx';

export function ForgotPassword(): ReactNode {
  const { t, client } = useOdin();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const request = useAuthRequest();
  async function send(): Promise<void> {
    const result = await request.run(
      () => requestPasswordReset(client, email, `${window.location.origin}/reset-password`),
      true,
    );
    if (result?.ok) setSent(true);
  }
  return (
    <AuthShell title={t('auth.password.forgot')} error={request.error}>
      <p>{t('auth.password.recovery_intro')}</p>
      {sent && <p role="status">{t('auth.password.reset_sent')}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <EmailField value={email} onChange={setEmail} disabled={request.pending} />
        <button
          className="button button--primary"
          disabled={request.disabled || request.cooldown > 0}
          type="submit"
        >
          {request.cooldown > 0
            ? t('auth.code.resend_in', { seconds: request.cooldown })
            : t('auth.password.send_reset')}
        </button>
      </form>
      <p>
        <Link to="/sign-in">{t('auth.password.sign_in')}</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPassword(): ReactNode {
  const { t, client, user, authReady } = useOdin();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false);
  const request = useAuthRequest();
  async function save(): Promise<void> {
    if (!isRecoveryUser(user?.id)) return;
    const issue = validateNewPassword(password, confirmation);
    if (issue !== null) {
      request.setError(commandError('VALIDATION', issue));
      return;
    }
    const result = await request.run(() => updatePassword(client, password));
    if (result !== null) {
      setPassword('');
      setConfirmation('');
    }
    if (result?.ok) {
      setDone(true);
      setRecoveryUser(null);
    }
  }
  if (!authReady) return <AuthShell title={t('auth.password.working')}>{null}</AuthShell>;
  if (done)
    return (
      <AuthShell title={t('auth.password.updated')}>
        <p>{t('auth.password.updated_intro')}</p>
        <Link className="button button--primary" to="/">
          {t('onboarding.name.continue')}
        </Link>
      </AuthShell>
    );
  if (!isRecoveryUser(user?.id))
    return (
      <AuthShell title={t('auth.password.reset')}>
        <p role="alert">{t('auth.password.invalid_link')}</p>
        <Link to="/forgot-password">{t('auth.password.send_reset')}</Link>
      </AuthShell>
    );
  return (
    <AuthShell title={t('auth.password.reset')} error={request.error}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
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
        <button className="button button--primary" disabled={request.disabled} type="submit">
          {t(request.pending ? 'auth.password.working' : 'auth.password.save')}
        </button>
      </form>
    </AuthShell>
  );
}
