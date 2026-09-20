import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
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
      onHealthChange: setRealtimeHealthy,
    });

    return () => subscription.unsubscribe();
  }, [client, householdId, queryClient, setRealtimeHealthy]);

  /** Records the moment of the last authoritative read, for the stale banner. */
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'success') markSynced();
    });
  }, [queryClient, markSynced]);

  /**
   * Bounded fallback while realtime is down. It stops entirely when offline so
   * a dropped connection does not turn into an unbounded refetch loop.
   */
  useEffect(() => {
    if (householdId === null || realtimeHealthy || !online) return;

    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myTasks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unassigned });
    }, UNHEALTHY_POLL_MS);

    return () => clearInterval(timer);
  }, [householdId, realtimeHealthy, online, queryClient]);

  /**
   * Authoritative membership is re-read first when the app returns to the
   * foreground, so a revoked member cannot keep acting on cached household data.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.household });
    });
    return () => subscription.remove();
  }, [queryClient]);
}
