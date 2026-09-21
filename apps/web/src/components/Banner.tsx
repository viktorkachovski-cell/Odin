import type { ReactNode } from 'react';

import type { CommandError } from '@odin/contracts';
import type { Translator, TranslationKey } from '@odin/i18n';
import { TRANSLATION_KEYS } from '@odin/i18n';

/**
 * Renders a typed error as localized text. The server's `message_key` is used
 * when it is one we actually ship, otherwise we fall back to the generic message
 * for the code -- a raw key or SQL text must never reach the user.
 */

export function errorMessage(error: CommandError, t: Translator): string {
  const key = error.message_key;
  if ((TRANSLATION_KEYS as readonly string[]).includes(key)) {
    return t(key as TranslationKey);
  }
  return t(`error.${error.code.toLowerCase()}` as TranslationKey);
}

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
