import { renderHook, waitFor } from '@testing-library/react-native';

import type { CrossListTaskDto } from '@odin/contracts';

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
  foreground: false,
  locale: 'en' as 'en' | 'bg',
  myTasks: [] as readonly CrossListTaskDto[],
  unassigned: [] as readonly CrossListTaskDto[],
};

jest.mock('./OdinContext.ts', () => ({ useOdin: () => ({ locale: mockState.locale }) }));
jest.mock('./useAppForeground.ts', () => ({ useAppForeground: () => mockState.foreground }));
jest.mock('./queries.ts', () => ({
  useMyTasksQuery: () => ({ data: { items: mockState.myTasks, next_cursor: null } }),
  useUnassignedQuery: () => ({ data: { items: mockState.unassigned, next_cursor: null } }),
}));

import { useTaskNotifications } from './useTaskNotifications.ts';

const NOW = Date.now();
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

function task(overrides: Partial<CrossListTaskDto> = {}): CrossListTaskDto {
  return {
    task_id: 't1',
    list_id: 'l1',
    list_title: 'Weekly',
    title: 'Water the plants',
    due_at: null,
    has_no_due: true,
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
    mockState.myTasks = [task(), task({ task_id: 't2', title: 'Take out bins' })];
    await rerender(undefined);

    await waitFor(() => expect(titles()).toEqual(['A task is now yours']));
    expect(native.__presented[0]?.body).toBe('Take out bins — in Weekly');
  });

  it('collapses a burst into one summary rather than a stack', async () => {
    const { rerender } = await renderHook(() => useTaskNotifications(true));

    mockState.myTasks = [
      task(),
      task({ task_id: 't2', title: 'Take out bins' }),
      task({ task_id: 't3', title: 'Hoover' }),
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

  it('schedules one reminder per stage, keyed by task, stage and language', async () => {
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    await renderHook(() => useTaskNotifications(true));

    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    expect([...native.__scheduled.keys()].sort()).toEqual([
      'odin-due:en:t1:day',
      'odin-due:en:t1:hours',
      'odin-due:en:t1:imminent',
    ]);
  });

  it('covers unassigned tasks as well as your own', async () => {
    mockState.unassigned = [
      task({ task_id: 'u1', title: 'Book the plumber', due_at: dueAt, has_no_due: false }),
    ];
    await renderHook(() => useTaskNotifications(true));

    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    expect([...native.__scheduled.keys()].every((key) => key.includes('u1'))).toBe(true);
  });

  it('leaves reminders already in place alone', async () => {
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    // A fresh array with identical content: the reconciler re-runs and must
    // recognise its own work instead of scheduling a second copy.
    native.scheduleNotificationAsync.mockClear();
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    await rerender(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(3));
    expect(native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels reminders when the deadline is removed', async () => {
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.myTasks = [task({ due_at: null, has_no_due: true })];
    await rerender(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });

  it('cancels reminders when the task leaves your lists entirely', async () => {
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.myTasks = [];
    await rerender(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });

  it('re-words reminders when the member changes language', async () => {
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    mockState.locale = 'bg';
    await rerender(undefined);

    await waitFor(() =>
      expect([...native.__scheduled.keys()].sort()).toEqual([
        'odin-due:bg:t1:day',
        'odin-due:bg:t1:hours',
        'odin-due:bg:t1:imminent',
      ]),
    );
  });

  it('holds no reminders while notifications are off', async () => {
    mockState.myTasks = [task({ due_at: dueAt, has_no_due: false })];
    const { rerender } = await renderHook(() => useTaskNotifications(true));
    await waitFor(() => expect(native.__scheduled.size).toBe(3));

    await rerender(undefined);
    const { rerender: rerenderOff } = await renderHook(() => useTaskNotifications(false));
    await rerenderOff(undefined);

    await waitFor(() => expect(native.__scheduled.size).toBe(0));
  });
});
