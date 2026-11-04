import { renderHook, waitFor } from '@testing-library/react-native';

import type { HouseholdTaskDto } from '@odin/contracts';

/**
 * Delivery behaviour, driven through the in-memory `expo-notifications` double
 * in `jest.setup.ts`. Assertions are on what the device would actually show
 * and hold, not on which functions were called.
 */

interface NotificationDouble {
  readonly __scheduled: Map<string, { readonly identifier: string; readonly fireAtMs: number }>;
  readonly __presented: { readonly title?: string | null; readonly body?: string | null }[];
  readonly __reset: (granted?: boolean, canAskAgain?: boolean) => void;
  readonly scheduleNotificationAsync: jest.Mock;
}

const native = jest.requireMock<NotificationDouble>('expo-notifications');

const mockState = {
  userId: 'me' as string | null,
  foreground: false,
  locale: 'en' as 'en' | 'bg',
  myTasks: [] as readonly HouseholdTaskDto[],
  unassigned: [] as readonly HouseholdTaskDto[],
};

jest.mock('./OdinContext.ts', () => ({
  useOdin: () => ({
    locale: mockState.locale,
    user: mockState.userId === null ? null : { id: mockState.userId },
  }),
}));
jest.mock('./useAppForeground.ts', () => ({ useAppForeground: () => mockState.foreground }));
jest.mock('./queries.ts', () => ({
  useMyTasksQuery: () => ({ data: { items: mockState.myTasks } }),
  useUnassignedQuery: () => ({ data: { items: mockState.unassigned } }),
}));

import { useTaskNotifications } from './useTaskNotifications.ts';

const NOW = Date.now();
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

function task(overrides: Partial<HouseholdTaskDto> = {}): HouseholdTaskDto {
  return {
    id: 't1',
    household_id: 'h1',
    list_id: 'l1',
    list_title: 'Weekly',
    title: 'Water the plants',
    notes: null,
    sort_order: 0,
    completed: false,
    blocked: false,
    assignee_ids: ['me'],
    assignee_id: 'me',
    due_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

function titles(): (string | null | undefined)[] {
  return native.__presented.map((entry) => entry.title);
}

beforeEach(() => {
  native.__reset();
  native.scheduleNotificationAsync.mockClear();
  mockState.userId = 'me';
  mockState.foreground = false;
  mockState.locale = 'en';
  mockState.myTasks = [];
  mockState.unassigned = [];
});

describe('announcing changes', () => {
  it('takes the first reading as a silent baseline', async () => {
    mockState.myTasks = [task()];
    await renderHook(() => useTaskNotifications(true));

    await waitFor(() => expect(native.__presented).toEqual([]));
  });

  it('announces a task that has become yours', async () => {
    const { rerender } = await renderHook(() => useTaskNotifications(true));

    mockState.myTasks = [task()];
    await rerender(undefined);

    await waitFor(() => expect(titles()).toEqual(['A task is now yours']));
    expect(native.__presented[0]?.body).toBe('Water the plants — in Weekly');
  });

  it('announces an edit to a task of yours', async () => {
    mockState.myTasks = [task()];
    const { rerender } = await renderHook(() => useTaskNotifications(true));

    mockState.myTasks = [task({ version: 2 })];
    await rerender(undefined);

    await waitFor(() => expect(titles()).toEqual(['One of your tasks changed']));
  });

  it('says nothing while you are looking at the app, and nothing later about it', async () => {
    // This is what stops Odin announcing your own claim or edit back at you.
    mockState.foreground = true;
    const { rerender } = await renderHook(() => useTaskNotifications(true));

    mockState.myTasks = [task()];
    await rerender(undefined);
    await waitFor(() => expect(native.__presented).toEqual([]));

    // Leaving the app must not replay the change that was deliberately silent.
    mockState.foreground = false;
    mockState.myTasks = [task(), task({ id: 't2', title: 'Take out bins' })];
    await rerender(undefined);

    await waitFor(() => expect(titles()).toEqual(['A task is now yours']));
    expect(native.__presented[0]?.body).toBe('Take out bins — in Weekly');
  });

  it('collapses a burst into one summary rather than a stack', async () => {
    const { rerender } = await renderHook(() => useTaskNotifications(true));

    mockState.myTasks = [
      task(),
      task({ id: 't2', title: 'Take out bins' }),
      task({ id: 't3', title: 'Hoover' }),
    ];
    await rerender(undefined);

    await waitFor(() => expect(titles()).toEqual(['New tasks for you']));
    expect(native.__presented[0]?.body).toBe('3 tasks are now yours');
  });

  it('says nothing at all when notifications are off', async () => {
    const { rerender } = await renderHook(() => useTaskNotifications(false));

    mockState.myTasks = [task()];
    await rerender(undefined);

    await waitFor(() => expect(native.__presented).toEqual([]));
  });
});

describe('deadline reminders', () => {
  const dueAt = new Date(NOW + THREE_DAYS).toISOString();

  it('schedules one reminder per stage, keyed by task, stage, language and moment', async () => {
    mockState.myTasks = [task({ due_at: dueAt })];
    await renderHook(() => useTaskNotifications(true));

    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    const due = Date.parse(dueAt);
    expect([...native.__scheduled.keys()].sort()).toEqual(
      [
        `odin-due:en:t1:day:${String(due - 24 * 60 * 60 * 1000)}`,
        `odin-due:en:t1:hours:${String(due - 4 * 60 * 60 * 1000)}`,
        `odin-due:en:t1:imminent:${String(due - 60 * 60 * 1000)}`,
      ].sort(),
    );
  });

  it('covers unassigned tasks as well as your own', async () => {
    mockState.unassigned = [
      task({
        id: 'u1',
        title: 'Book the plumber',
        due_at: dueAt,
        assignee_ids: [],
        assignee_id: null,
      }),
    ];
    await renderHook(() => useTaskNotifications(true));

    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    expect([...native.__scheduled.keys()].every((key) => key.includes('u1'))).toBe(true);
  });

  it('leaves reminders already in place alone', async () => {
    mockState.myTasks = [task({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    // A fresh array with identical content: the reconciler re-runs and must
    // recognise its own work instead of scheduling a second copy.
    native.scheduleNotificationAsync.mockClear();
    mockState.myTasks = [task({ due_at: dueAt })];
    await rerender(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels reminders when the deadline is removed', async () => {
    mockState.myTasks = [task({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.myTasks = [task({ due_at: null })];
    await rerender(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });

  it('cancels reminders when the task leaves your lists entirely', async () => {
    mockState.myTasks = [task({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.myTasks = [];
    await rerender(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });

  it('re-words reminders when the member changes language', async () => {
    mockState.myTasks = [task({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.locale = 'bg';
    await rerender(undefined);

    await waitFor(() => {
      const keys = [...native.__scheduled.keys()];
      expect(keys).toHaveLength(3);
      expect(keys.every((key) => key.startsWith('odin-due:bg:t1:'))).toBe(true);
    });
  });

  it('holds no reminders while notifications are off', async () => {
    mockState.myTasks = [task({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    await rerender(undefined);
    const { rerender: rerenderOff } = await renderHook(() => useTaskNotifications(false));
    await rerenderOff(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });
});

describe('shared tasks', () => {
  const dueAt = new Date(NOW + THREE_DAYS).toISOString();
  const shared = (overrides: Partial<HouseholdTaskDto> = {}) =>
    task({ assignee_ids: ['me', 'other'], assignee_id: 'me', ...overrides });

  // Each assignee's phone runs this hook for its own member, so the one shared
  // task produces one announcement on every phone.
  it.each(['me', 'other'])('tells assignee %s about the one shared task', async (member) => {
    mockState.userId = member;
    mockState.myTasks = [];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    mockState.myTasks = [shared({ assignee_id: member })];
    await rerender(undefined);
    await waitFor(() => expect(titles()).toEqual(['A task is now yours']));
    expect(native.__presented).toHaveLength(1);
  });

  it('announces being added to a task as news, once', async () => {
    mockState.myTasks = [];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    mockState.myTasks = [shared({ version: 2 })];
    await rerender(undefined);
    await waitFor(() => expect(titles()).toEqual(['A task is now yours']));

    // The same reading again says nothing more.
    mockState.myTasks = [shared({ version: 2 })];
    await rerender(undefined);
    expect(titles()).toEqual(['A task is now yours']);
  });

  it('counts someone else joining a task of mine as a change to it', async () => {
    mockState.myTasks = [task({ assignee_ids: ['me'] })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    mockState.myTasks = [shared({ version: 2 })];
    await rerender(undefined);
    await waitFor(() => expect(titles()).toEqual(['One of your tasks changed']));
  });

  it('does not announce a listed task that no longer names me', async () => {
    mockState.myTasks = [];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    mockState.myTasks = [task({ assignee_ids: ['other'], assignee_id: 'other', version: 2 })];
    await rerender(undefined);
    await waitFor(() => expect(native.__presented).toEqual([]));
  });

  it('keeps exactly one reminder per stage for a task shared with me', async () => {
    mockState.myTasks = [shared({ due_at: dueAt })];
    await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));
  });

  it('holds one set of reminders for a task both reads list while it moves between them', async () => {
    const moving = shared({ due_at: dueAt });
    mockState.myTasks = [moving];
    mockState.unassigned = [{ ...moving, assignee_ids: [], assignee_id: null }];
    await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));
  });

  it('follows a task from Mine to Unassigned and back without duplicating reminders', async () => {
    mockState.myTasks = [shared({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    native.scheduleNotificationAsync.mockClear();

    // Everyone cleared: nobody has it, so the deadline still matters to me.
    mockState.myTasks = [];
    mockState.unassigned = [
      shared({ due_at: dueAt, assignee_ids: [], assignee_id: null, version: 2 }),
    ];
    await rerender(undefined);
    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();

    // Assigned to me again: announced as news, but no reminder is scheduled twice.
    mockState.unassigned = [];
    mockState.myTasks = [shared({ due_at: dueAt, assignee_ids: ['me'], version: 3 })];
    await rerender(undefined);
    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    const scheduledReminders = native.scheduleNotificationAsync.mock.calls.filter(
      ([request]: [{ readonly trigger: unknown }]) => request.trigger !== null,
    );
    expect(scheduledReminders).toEqual([]);
  });

  it('drops the reminders when I am removed but others remain', async () => {
    mockState.myTasks = [shared({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.myTasks = [];
    mockState.unassigned = [];
    await rerender(undefined);
    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });

  it('drops the reminders when the shared task is completed by anyone', async () => {
    mockState.myTasks = [shared({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.myTasks = [shared({ due_at: dueAt, completed: true, version: 2 })];
    await rerender(undefined);
    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });

  it('reschedules a shared task when its deadline moves', async () => {
    mockState.myTasks = [shared({ due_at: dueAt })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    const before = [...native.__scheduled.values()].map((entry) => entry.fireAtMs).sort();

    mockState.myTasks = [
      shared({ due_at: new Date(NOW + 2 * THREE_DAYS).toISOString(), version: 2 }),
    ];
    await rerender(undefined);
    await waitFor(() => {
      const after = [...native.__scheduled.values()].map((entry) => entry.fireAtMs).sort();
      expect(after).not.toEqual(before);
      expect(after).toHaveLength(3);
    });
  });

  it('stays silent and holds no reminders when I am not signed in', async () => {
    mockState.userId = null;
    mockState.myTasks = [shared({ due_at: dueAt })];
    await renderHook(() => useTaskNotifications(true));
    expect(native.__presented).toEqual([]);
    expect(native.__scheduled.size).toBe(0);
  });

  it('keeps the permission and mute gate over shared tasks too', async () => {
    mockState.myTasks = [shared({ due_at: dueAt })];
    await renderHook(() => useTaskNotifications(false));
    expect(native.__presented).toEqual([]);
    expect(native.__scheduled.size).toBe(0);
  });
});
