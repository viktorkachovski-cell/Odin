import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useOdin } from '../app/OdinContext.ts';
import { emailLinkConfirmed } from '../auth-links.ts';
import { AuthShell } from '../components/AuthForm.tsx';
import { getPendingInvitation } from '../pending-invitation.ts';

export function EmailConfirmed(): ReactNode {
  const { t, user } = useOdin();
  const confirmed = emailLinkConfirmed() && user !== null;
  return (
    <AuthShell title={t(confirmed ? 'auth.password.confirmed' : 'auth.password.sign_in')}>
      <p>{t(confirmed ? 'auth.password.confirmed_intro' : 'auth.password.confirmation_help')}</p>
      <p>{t('auth.password.reopen_invite')}</p>
      <Link
        className="button button--primary"
        to={confirmed ? (getPendingInvitation() === null ? '/' : '/invite') : '/sign-in'}
      >
        {t(confirmed ? 'onboarding.name.continue' : 'auth.password.sign_in')}
      </Link>
    </AuthShell>
  );
}
