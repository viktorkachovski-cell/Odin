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
 * Realtime hints drive invalidation and are never the source of truth, so the
 * app also reconciles on returning to the foreground or the network, when the
 * channel recovers, and by a poll that backs off while the channel is down.
 */

const UNHEALTHY_POLL_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;
const UNHEALTHY_POLL_MAX_MS = 60_000;

/** Delay before zero-based poll `attempt` of one unhealthy spell. */
export function unhealthyPollDelay(attempt: number): number {
  return UNHEALTHY_POLL_DELAYS_MS[attempt] ?? UNHEALTHY_POLL_MAX_MS;
}

export function useHouseholdRealtime(householdId: string | null): void {
  const { client, setRealtimeHealthy, realtimeHealthy, online, markSynced } = useOdin();
  const queryClient = useQueryClient();
  const foreground = useAppForeground();
  const active = online && foreground;

  // The channel lives for the household, so its callbacks read this ref.
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
        // Only a (re)join can have missed events; while away, the return reconciles.
        if (next && !healthy && activeRef.current) void reconcile();
        healthy = next;
      },
    });

    return () => subscription.unsubscribe();
  }, [client, householdId, queryClient, setRealtimeHealthy, reconcile]);

  // Every successful read counts as a sync for the stale banner.
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') markSynced();
    });
  }, [queryClient, markSynced]);

  // Fallback while realtime is down: never offline or in the background, and
  // each new unhealthy spell starts from the short delay.
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

  // Membership is re-read first on each return, so a revoked member cannot act
  // on cached data. Not at mount: the reads are loading and the first join reconciles.
  const wasActive = useRef(active);
  useEffect(() => {
    const resumed = active && !wasActive.current;
    wasActive.current = active;
    if (resumed && householdId !== null) void reconcile();
  }, [active, householdId, reconcile]);
}
