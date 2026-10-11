import type { ReactNode } from 'react';

import { useOdin } from '../state/OdinContext.ts';
import { LoadFailure } from './Banner.tsx';
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
      <LoadFailure error={error} onRetry={onRetry} t={t} />
    </Screen>
  );
}
