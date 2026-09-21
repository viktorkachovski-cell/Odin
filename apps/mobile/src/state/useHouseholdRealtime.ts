import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  keysAffectedByListChange,
  keysAffectedByMembershipChange,
  keysAffectedByTaskChange,
  queryKeys,
  subscribeToHousehold,
  type ChangeKind,
} from '@odin/data';

import { useOdin } from './OdinContext.ts';

/**
 * Realtime hints drive invalidation; they are never treated as the source of
 * truth. Because no event stream is guaranteed complete, the app also
 * reconciles when Android brings it back to the foreground, and polls at a
 * bounded interval while the channel is unhealthy.
 */

const UNHEALTHY_POLL_MS = 3000;

function keysFor(kind: ChangeKind): readonly (readonly string[])[] {
  switch (kind) {
    case 'task':
      return keysAffectedByTaskChange();
    case 'list':
      return keysAffectedByListChange();
    case 'membership':
      return keysAffectedByMembershipChange();
  }
}

export function useHouseholdRealtime(householdId: string | null): void {
  const { client, setRealtimeHealthy, realtimeHealthy, online, markSynced } = useOdin();
  const queryClient = useQueryClient();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const reconcile = useCallback(async () => {
    await queryClient.invalidateQueries(
      { queryKey: queryKeys.household },
      { cancelRefetch: false },
    );
    await Promise.all(
      [...keysAffectedByMembershipChange().filter((key) => key[0] !== 'household'), ['list']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false }),
      ),
    );
  }, [queryClient]);

  useEffect(() => {
    if (householdId === null) return;

    const subscription = subscribeToHousehold(client, householdId, {
      onChange: (kind) => {
        for (const key of keysFor(kind)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        // An open list detail is refetched by its own key prefix.
        void queryClient.invalidateQueries({ queryKey: ['list'] });
      },
      onHealthChange: (healthy) => {
        setRealtimeHealthy(healthy);
        if (healthy && online && foreground) void reconcile();
      },
    });

    return () => subscription.unsubscribe();
  }, [client, householdId, queryClient, setRealtimeHealthy, online, foreground, reconcile]);

  /** Records the moment of the last authoritative read, for the stale banner. */
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') markSynced();
    });
  }, [queryClient, markSynced]);

  /**
   * Bounded fallback while realtime is down. It stops entirely when offline so
   * a dropped connection does not turn into an unbounded refetch loop.
   */
  useEffect(() => {
    if (householdId === null || realtimeHealthy || !online || !foreground) return;

    const timer = setInterval(() => {
      void reconcile();
    }, UNHEALTHY_POLL_MS);

    return () => clearInterval(timer);
  }, [householdId, realtimeHealthy, online, foreground, reconcile]);

  /**
   * Authoritative membership is re-read first when the app returns to the
   * foreground, so a revoked member cannot keep acting on cached household data.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      setForeground(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (householdId !== null && online && foreground) void reconcile();
  }, [householdId, online, foreground, reconcile]);
}
