import type { ReactNode } from 'react';
import { OdinError } from '@odin/data';

import { useOdin } from '../state/OdinContext.ts';
import { ErrorBanner } from './Banner.tsx';
import { Screen } from './Screen.tsx';

export function QueryFailure({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}): ReactNode {
  const { t } = useOdin();
  return (
    <Screen>
      <ErrorBanner
        error={
          error instanceof OdinError
            ? error.info
            : { code: 'UNKNOWN', message_key: 'error.unknown' }
        }
        t={t}
        onRetry={onRetry}
      />
    </Screen>
  );
}
