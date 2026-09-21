import { useEffect } from 'react';
import { AppState } from 'react-native';

import { setSessionAutoRefresh, type OdinSupabaseClient } from '@odin/data';

/** One listener at the provider; serialize rapid foreground/background transitions. */
export function useSessionRefresh(client: OdinSupabaseClient): void {
  useEffect(() => {
    let pending = Promise.resolve();
    const update = (active: boolean): void => {
      // Do not leak an SDK exception (which may contain session data) to logging.
      // A later lifecycle event retries; authenticated requests still refresh on demand.
      pending = pending.then(() => setSessionAutoRefresh(client, active)).catch(() => undefined);
    };
    update(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => update(state === 'active'));
    return () => {
      subscription.remove();
      update(false);
    };
  }, [client]);
}
