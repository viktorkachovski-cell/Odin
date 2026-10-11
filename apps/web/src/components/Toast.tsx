import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * A short confirmation that disappears on its own, replacing sentences that
 * used to stay on the page after the thing they confirmed was already visible.
 * Announced politely; errors never use this, they stay as banners.
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
