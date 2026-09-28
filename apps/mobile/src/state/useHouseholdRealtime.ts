import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import {
  keysAffectedByChanges,
  keysAffectedByMembershipChange,
  queryKeys,
  subscribeToHousehold,
} from '@odin/data';

import { useOdin } from './OdinContext.ts';
import { useAppForeground } from './useAppForeground.ts';

/**
 * Realtime hints drive invalidation; they are never treated as the source of
 * truth. Because no event stream is guaranteed complete, the app also
 * reconciles when Android brings it back to the foreground or the network
 * returns, when the channel recovers, and by a backing-off poll while the
 * channel is unhealthy.
 */

/** Poll quickly at first, then settle: a long outage should not keep the radio awake. */
const UNHEALTHY_POLL_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;
const UNHEALTHY_POLL_MAX_MS = 60_000;

/** Delay before poll number `attempt` (zero-based) of one unhealthy spell. */
export function unhealthyPollDelay(attempt: number): number {
  return UNHEALTHY_POLL_DELAYS_MS[attempt] ?? UNHEALTHY_POLL_MAX_MS;
}

export function useHouseholdRealtime(householdId: string | null): void {
  const { client, setRealtimeHealthy, realtimeHealthy, online, markSynced } = useOdin();
  const queryClient = useQueryClient();
  const foreground = useAppForeground();
  const active = online && foreground;

  // The channel outlives foreground and network changes -- rejoining on each
  // one cost a round trip and a full refetch every time the app was opened --
  // so its callbacks read the current answer instead of closing over it.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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

    let healthy = false;
    const subscription = subscribeToHousehold(client, householdId, {
      onChange: (kinds) => {
        // Includes the `['list']` prefix, so an open list detail refetches too.
        for (const queryKey of keysAffectedByChanges(kinds)) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
      onHealthChange: (next) => {
        setRealtimeHealthy(next);
        // Only a (re)join can have missed events. A recovery while the app is
        // away is covered by the reconcile on its return.
        if (next && !healthy && activeRef.current) void reconcile();
        healthy = next;
      },
    });

    return () => subscription.unsubscribe();
  }, [client, householdId, queryClient, setRealtimeHealthy, reconcile]);

  /** Records the moment of the last authoritative read, for the stale banner. */
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') markSynced();
    });
  }, [queryClient, markSynced]);

  /**
   * Fallback while realtime is down, backing off to one reconcile a minute. It
   * stops entirely when offline or in the background, and each new unhealthy
   * spell starts from the short delay again.
   */
  useEffect(() => {
    if (householdId === null || realtimeHealthy || !active) return;

    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      timer = setTimeout(() => {
        void reconcile();
        schedule();
      }, unhealthyPollDelay(attempt));
      attempt += 1;
    };
    schedule();

    return () => clearTimeout(timer);
  }, [householdId, realtimeHealthy, active, reconcile]);

  /**
   * Authoritative membership is re-read first when the app returns to the
   * foreground or the network returns, so a revoked member cannot keep acting
   * on cached household data. Only the transition counts: at mount the reads
   * are already loading, and the channel's first join reconciles after them.
   */
  const wasActive = useRef(active);
  useEffect(() => {
    const resumed = active && !wasActive.current;
    wasActive.current = active;
    if (resumed && householdId !== null) void reconcile();
  }, [active, householdId, reconcile]);
}
