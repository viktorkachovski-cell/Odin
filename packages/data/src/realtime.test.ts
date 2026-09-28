import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { keysAffectedByChanges, keysAffectedByMembershipChange } from './query-keys.ts';
import { subscribeToHousehold, type ChangeKind } from './realtime.ts';

/** Just enough of a realtime channel to deliver row events and statuses. */
function fakeClient() {
  const rowHandlers = new Map<string, () => void>();
  let status: (value: string) => void = () => undefined;
  const channel = {
    on: vi.fn((_type: string, filter: { table: string }, handler: () => void) => {
      rowHandlers.set(filter.table, handler);
      return channel;
    }),
    subscribe: vi.fn((callback: (value: string) => void) => {
      status = callback;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  };
  return {
    client: client as unknown as OdinSupabaseClient,
    removeChannel: client.removeChannel,
    row: (table: 'lists' | 'tasks' | 'memberships') => rowHandlers.get(table)?.(),
    status: (value: string) => status(value),
  };
}

function recorder() {
  const batches: ChangeKind[][] = [];
  const health: boolean[] = [];
  return {
    batches,
    health,
    handlers: {
      onChange: (kinds: ReadonlySet<ChangeKind>) => batches.push([...kinds].sort()),
      onHealthChange: (healthy: boolean) => health.push(healthy),
    },
  };
}

describe('subscribeToHousehold', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers a lone change at once', () => {
    const fake = fakeClient();
    const seen = recorder();
    subscribeToHousehold(fake.client, 'h1', seen.handlers);

    fake.row('tasks');

    expect(seen.batches).toEqual([['task']]);
  });

  it('turns a burst of row events into one immediate and one closing batch', () => {
    const fake = fakeClient();
    const seen = recorder();
    subscribeToHousehold(fake.client, 'h1', seen.handlers);

    // Copying a twenty-task template: one list row, then one row per task.
    fake.row('lists');
    for (let task = 0; task < 20; task += 1) {
      vi.advanceTimersByTime(5);
      fake.row('tasks');
    }
    expect(seen.batches).toEqual([['list']]);

    vi.advanceTimersByTime(500);
    expect(seen.batches).toEqual([['list'], ['task']]);

    vi.advanceTimersByTime(5_000);
    expect(seen.batches).toHaveLength(2);
  });

  it('keeps a steady stream to one batch per window', () => {
    const fake = fakeClient();
    const seen = recorder();
    subscribeToHousehold(fake.client, 'h1', seen.handlers);

    for (let event = 0; event < 20; event += 1) {
      fake.row('tasks');
      vi.advanceTimersByTime(60);
    }
    vi.advanceTimersByTime(500);

    // 1.2 s of events at 60 ms apart: at most one batch per 500 ms window.
    expect(seen.batches.length).toBeLessThanOrEqual(4);
    expect(seen.batches.flat().every((kind) => kind === 'task')).toBe(true);
  });

  it('delivers by the clock when timers are paused, as Android does in the background', () => {
    const fake = fakeClient();
    const seen = recorder();
    subscribeToHousehold(fake.client, 'h1', seen.handlers);
    fake.row('tasks');
    fake.row('lists');
    expect(seen.batches).toEqual([['task']]);

    // Time passes but no timer runs.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    fake.row('memberships');

    expect(seen.batches).toEqual([['task'], ['list', 'membership']]);
    // The paused timer, firing late on return, has nothing left to deliver.
    vi.runOnlyPendingTimers();
    expect(seen.batches).toHaveLength(2);
  });

  it('does not hold hints when the device clock is set back', () => {
    const fake = fakeClient();
    const seen = recorder();
    subscribeToHousehold(fake.client, 'h1', seen.handlers);
    fake.row('tasks');

    vi.setSystemTime(Date.now() - 60 * 60_000);
    fake.row('lists');

    expect(seen.batches).toEqual([['task'], ['list']]);
  });

  it('reports health until the caller leaves, then stays silent', () => {
    const fake = fakeClient();
    const seen = recorder();
    const subscription = subscribeToHousehold(fake.client, 'h1', seen.handlers);

    fake.status('SUBSCRIBED');
    fake.status('CHANNEL_ERROR');
    fake.row('tasks');
    fake.row('tasks');
    subscription.unsubscribe();
    fake.status('CLOSED');
    fake.row('tasks');
    vi.advanceTimersByTime(5_000);

    expect(seen.health).toEqual([true, false]);
    expect(seen.batches).toEqual([['task']]);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe('keysAffectedByChanges', () => {
  const ids = (keys: readonly (readonly string[])[]) => keys.map((key) => key.join('/'));

  it('names every affected key once', () => {
    const keys = ids(keysAffectedByChanges(['task', 'list', 'task']));

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(['all-tasks', 'home', 'list', 'my-tasks', 'task', 'unassigned']);
  });

  it('covers everything a membership change affects', () => {
    expect(ids(keysAffectedByChanges(['membership', 'task'])).sort()).toEqual(
      ids(keysAffectedByMembershipChange()).sort(),
    );
  });

  it('affects nothing for an empty batch', () => {
    expect(keysAffectedByChanges([])).toEqual([]);
  });
});
