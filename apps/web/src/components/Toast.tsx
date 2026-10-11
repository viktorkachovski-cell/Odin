import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

import type { Translator } from '@odin/i18n';

/**
 * A short confirmation that disappears on its own, announced politely. Errors
 * never use this; they stay as banners.
 */

const TOAST_MS = 5000;

export function Toast({
  message,
  action,
  onDismiss,
}: {
  readonly message: string;
  readonly action?: { readonly label: string; readonly to: string } | undefined;
  readonly onDismiss: () => void;
}): ReactNode {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {action !== undefined && (
        <Link className="toast__action" onClick={onDismiss} to={action.to}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function TemplateSavedToast({
  t,
  onDismiss,
}: {
  readonly t: Translator;
  readonly onDismiss: () => void;
}): ReactNode {
  return (
    <Toast
      action={{ label: t('toast.view'), to: '/lists?tab=templates' }}
      message={t('toast.template_saved')}
      onDismiss={onDismiss}
    />
  );
}
