import { useState, type ReactNode } from 'react';
import type { CommandError } from '@odin/contracts';
import { useAuthRequest as useSharedAuthRequest, type AuthRequest } from '@odin/data';
import { useOdin } from '../app/OdinContext.ts';
import { ErrorBanner } from './Banner.tsx';
import { Field } from './Field.tsx';

export function AuthShell({
  title,
  children,
  error,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly error?: CommandError | null;
}): ReactNode {
  const { t, locale, setLocale, online } = useOdin();
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="dialog__actions">
          <button
            className="button"
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'bg' : 'en')}
          >
            {locale === 'en' ? 'Български' : 'English'}
          </button>
        </div>
        <h1>{title}</h1>
        {!online && <p role="status">{t('auth.password.offline')}</p>}
        {error !== undefined && error !== null && <ErrorBanner error={error} t={t} />}
        {children}
      </div>
    </div>
  );
}

export function EmailField({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}): ReactNode {
  const { t } = useOdin();
  return (
    <Field label={t('auth.email.label')}>
      {(props) => (
        <input
          {...props}
          name="email"
          disabled={disabled}
          autoComplete="email"
          required
          type="email"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function PasswordField({
  value,
  onChange,
  newPassword = false,
  confirmation = false,
  disabled = false,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly newPassword?: boolean;
  readonly confirmation?: boolean;
  readonly disabled?: boolean;
}): ReactNode {
  const { t } = useOdin();
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={t(confirmation ? 'auth.password.confirm' : 'auth.password.label')}
      hint={newPassword && !confirmation ? t('auth.password.hint') : undefined}
    >
      {(props) => (
        <>
          <input
            {...props}
            name={confirmation ? 'password-confirmation' : 'password'}
            disabled={disabled}
            autoComplete={newPassword ? 'new-password' : 'current-password'}
            required
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            className="button"
            type="button"
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {t(visible ? 'auth.password.hide' : 'auth.password.show')}
          </button>
        </>
      )}
    </Field>
  );
}

export function useAuthRequest(): AuthRequest {
  return useSharedAuthRequest(useOdin().online);
}
