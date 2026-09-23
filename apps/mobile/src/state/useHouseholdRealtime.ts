import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import {
  keysAffectedByListChange,
  keysAffectedByMembershipChange,
  keysAffectedByTaskChange,
  queryKeys,
  subscribeToHousehold,
  type ChangeKind,
} from '@odin/data';

import { useOdin } from './OdinContext.ts';
import { useAppForeground } from './useAppForeground.ts';

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
  const foreground = useAppForeground();
  const activeRef = useRef({ online, foreground });
  activeRef.current = { online, foreground };
  const reconcileRef = useRef<{ householdId: string | null; promise: Promise<void> } | null>(null);
  const reconcile = useCallback(async () => {
    if (reconcileRef.current?.householdId === householdId) return reconcileRef.current.promise;
    const pending = (async () => {
      await queryClient.invalidateQueries(
        { queryKey: queryKeys.household },
        { cancelRefetch: false },
      );
      await Promise.all(
        [...keysAffectedByMembershipChange().filter((key) => key[0] !== 'household'), ['list']].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false }),
        ),
      );
    })();
    reconcileRef.current = { householdId, promise: pending };
    try {
      await pending;
    } finally {
      if (reconcileRef.current?.promise === pending) reconcileRef.current = null;
    }
  }, [householdId, queryClient]);

  useEffect(() => {
    if (householdId === null) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const pendingKinds = new Set<ChangeKind>();
    const flush = (): void => {
      timer = null;
      const keys = new Map<string, readonly string[]>();
      for (const kind of pendingKinds) {
        for (const key of keysFor(kind)) keys.set(key.join(':'), key);
      }
      if (pendingKinds.has('task') || pendingKinds.has('list')) keys.set('list', ['list']);
      pendingKinds.clear();
      for (const key of keys.values()) void queryClient.invalidateQueries({ queryKey: key });
    };

    const subscription = subscribeToHousehold(client, householdId, {
      onChange: (kind) => {
        pendingKinds.add(kind);
        if (timer === null) timer = setTimeout(flush, 100);
      },
      onHealthChange: (healthy) => {
        setRealtimeHealthy(healthy);
        if (healthy && activeRef.current.online && activeRef.current.foreground) void reconcile();
      },
    });

    return () => {
      if (timer !== null) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [client, householdId, queryClient, setRealtimeHealthy, reconcile]);

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
    if (householdId !== null && online && foreground) void reconcile();
  }, [householdId, online, foreground, reconcile]);
}
