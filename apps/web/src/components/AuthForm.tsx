import { useRef, useState, useEffect, type ReactNode } from 'react';
import type { CommandError, CommandResult } from '@odin/contracts';
import { useOdin } from '../app/OdinContext.ts';
import { errorMessage } from './Banner.tsx';
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
        {error !== undefined && error !== null && (
          <div className="banner banner--danger" role="alert">
            {errorMessage(error, t)}
          </div>
        )}
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

/** A ref closes the double-submit gap before React disables the button. */
export function useAuthRequest() {
  const locked = useRef(false);
  const { online } = useOdin();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  async function run<T>(
    operation: () => Promise<CommandResult<T>>,
    sendsEmail = false,
  ): Promise<CommandResult<T> | null> {
    if (locked.current || !online || (sendsEmail && cooldown > 0)) return null;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.ok) setError(result.error);
      if (sendsEmail) setCooldown(60);
      return result;
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { pending, error, setError, cooldown, run, disabled: pending || !online };
}
