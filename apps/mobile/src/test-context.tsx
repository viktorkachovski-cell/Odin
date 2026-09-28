import type { ReactNode } from 'react';

import { createTranslator } from '@odin/i18n';

import { OdinContext, type OdinContextValue } from './state/OdinContext.ts';

/** A signed-out, online context for rendering one piece of the app on its own in tests. */
export function odinValue(overrides: Partial<OdinContextValue> = {}): OdinContextValue {
  return {
    client: {} as OdinContextValue['client'],
    user: null,
    authReady: true,
    locale: 'en',
    setLocale: () => undefined,
    t: createTranslator('en'),
    online: true,
    realtimeHealthy: true,
    setRealtimeHealthy: () => undefined,
    lastSyncedAt: null,
    markSynced: () => undefined,
    signOut: () => Promise.resolve(),
    ...overrides,
  };
}

export function odinWrapper(overrides: Partial<OdinContextValue> = {}) {
  const value = odinValue(overrides);
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <OdinContext value={value}>{children}</OdinContext>;
  };
}
