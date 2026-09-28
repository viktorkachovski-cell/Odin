import type { ReactNode } from 'react';

import type { CommandError } from '@odin/contracts';
import { errorMessage, type Translator } from '@odin/i18n';

export function ErrorBanner({
  error,
  t,
  onRetry,
}: {
  readonly error: CommandError;
  readonly t: Translator;
  readonly onRetry?: (() => void) | undefined;
}): ReactNode {
  return (
    <div className="banner banner--danger" role="alert">
      <span aria-hidden="true" className="button__glyph">
        ⚠
      </span>
      <span className="banner__text">{errorMessage(error, t)}</span>
      {onRetry !== undefined && (
        <button className="button" onClick={onRetry} type="button">
          {t('state.retry')}
        </button>
      )}
    </div>
  );
}

/** Offline and reconnecting states are announced politely, not as alerts. */
export function StaleBanner({
  online,
  realtimeHealthy,
  t,
}: {
  readonly online: boolean;
  readonly realtimeHealthy: boolean;
  readonly t: Translator;
}): ReactNode {
  if (online && realtimeHealthy) return null;
  return (
    <div className="banner banner--warning" role="status">
      <span aria-hidden="true" className="button__glyph">
        ◴
      </span>
      <span className="banner__text">{online ? t('state.stale') : t('state.offline')}</span>
    </div>
  );
}
