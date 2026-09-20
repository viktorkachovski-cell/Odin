import { createContext, use } from 'react';

import type { AuthUser, OdinSupabaseClient } from '@odin/data';
import type { Locale, Translator } from '@odin/i18n';

export interface OdinContextValue {
  readonly client: OdinSupabaseClient;
  readonly user: AuthUser | null;
  /** False until the first session lookup settles, so guards do not flash. */
  readonly authReady: boolean;
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translator;
  readonly online: boolean;
  /** False while the realtime channel is down, so the UI can show stale data. */
  readonly realtimeHealthy: boolean;
  readonly setRealtimeHealthy: (healthy: boolean) => void;
  readonly signOut: () => Promise<void>;
}

export const OdinContext = createContext<OdinContextValue | null>(null);

export function useOdin(): OdinContextValue {
  const value = use(OdinContext);
  if (value === null) {
    throw new Error('useOdin must be used inside <OdinProvider>');
  }
  return value;
}
