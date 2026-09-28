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
  /**
   * Receives every kind of row that changed since the previous call. One
   * statement can change many rows -- copying a template inserts one per task
   * -- and each row arrives as its own event, so hints are coalesced rather
   * than turned into one refetch per row.
   */
  onChange(kinds: ReadonlySet<ChangeKind>): void;
  /** Fired when the channel is not healthy, so the UI can show stale state. */
  onHealthChange?(healthy: boolean): void;
}

export interface SubscriptionOptions {
  /** At most one `onChange` per window of this length. */
  readonly coalesceMs?: number;
}

export interface Subscription {
  unsubscribe(): void;
}

const TABLE_KINDS: Readonly<Record<string, ChangeKind>> = {
  lists: 'list',
  tasks: 'task',
  memberships: 'membership',
};

const DEFAULT_COALESCE_MS = 500;

/**
 * Subscribes to the authenticated household's rows. RLS governs delivery, so a
 * revoked member simply stops receiving events -- which is a UI hint, not the
 * authorization boundary. Server authorization is immediate and independent.
 *
 * The first hint after a quiet window is delivered at once and the rest of the
 * window is delivered together when it ends. The window is measured on the
 * clock rather than trusted to a timer: Android pauses JavaScript timers while
 * the app is in the background, and a change arriving then must still reach
 * the caller immediately instead of waiting for the app to return.
 */
export function subscribeToHousehold(
  client: OdinSupabaseClient,
  householdId: string,
  handlers: SubscriptionHandlers,
  options: SubscriptionOptions = {},
): Subscription {
  const coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
  const channel = client.channel(`household:${householdId}`);
  let closed = false;
  let pending = new Set<ChangeKind>();
  let lastDeliveredAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const deliver = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (closed || pending.size === 0) return;
    const kinds = pending;
    pending = new Set();
    lastDeliveredAt = Date.now();
    handlers.onChange(kinds);
  };

  const hint = (kind: ChangeKind): void => {
    if (closed) return;
    pending.add(kind);
    const wait = lastDeliveredAt + coalesceMs - Date.now();
    // Longer than a window means the device clock was set back; do not hold on to it.
    if (wait <= 0 || wait > coalesceMs) deliver();
    else timer ??= setTimeout(deliver, wait);
  };

  for (const table of Object.keys(TABLE_KINDS)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      () => {
        const kind = TABLE_KINDS[table];
        if (kind !== undefined) hint(kind);
      },
    );
  }

  channel.subscribe((status) => {
    // Leaving reports CLOSED; the caller that left is not asking any more.
    if (!closed) handlers.onHealthChange?.(status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
  });

  return {
    unsubscribe: () => {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      void client.removeChannel(channel);
    },
  };
}
