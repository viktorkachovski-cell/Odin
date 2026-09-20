/**
 * Realtime delivers invalidation hints, never authoritative data. Payload
 * contents are deliberately ignored: a change event only says "refetch this".
 *
 * Callers must reconcile on reconnect, focus and foreground as well, because
 * no event stream is guaranteed to be complete.
 */

import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

import type { OdinSupabaseClient } from './client.ts';

export type ChangeKind = 'list' | 'task' | 'membership';

export interface SubscriptionHandlers {
  onChange(kind: ChangeKind): void;
  /** Fired when the channel is not healthy, so the UI can show stale state. */
  onHealthChange?(healthy: boolean): void;
}

export interface Subscription {
  unsubscribe(): void;
}

const TABLE_KINDS: Readonly<Record<string, ChangeKind>> = {
  lists: 'list',
  tasks: 'task',
  memberships: 'membership',
};

/**
 * Subscribes to the authenticated household's rows. RLS governs delivery, so a
 * revoked member simply stops receiving events -- which is a UI hint, not the
 * authorization boundary. Server authorization is immediate and independent.
 */
export function subscribeToHousehold(
  client: OdinSupabaseClient,
  householdId: string,
  handlers: SubscriptionHandlers,
): Subscription {
  const channel = client.channel(`household:${householdId}`);

  for (const table of Object.keys(TABLE_KINDS)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      () => {
        const kind = TABLE_KINDS[table];
        if (kind !== undefined) handlers.onChange(kind);
      },
    );
  }

  channel.subscribe((status) => {
    handlers.onHealthChange?.(status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
  });

  return {
    unsubscribe: () => {
      void client.removeChannel(channel);
    },
  };
}
