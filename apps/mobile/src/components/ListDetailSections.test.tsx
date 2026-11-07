import { act, render, screen as rendered } from '@testing-library/react-native';
import {
  Keyboard,
  StyleSheet,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ListTasks, QuickAddBar } from './ListDetailSections.tsx';

/**
 * Each task row renders one action menu, so the menu counts row renders; the
 * double also keeps the last menu's labels.
 */
const mockMenus: string[] = [];
let mockLastActions: string[] = [];
jest.mock('./ActionMenu.tsx', () => ({
  ActionMenu: ({
    accessibilityLabel,
    actions,
  }: {
    readonly accessibilityLabel: string;
    readonly actions: readonly { readonly label: string }[];
  }) => {
    mockMenus.push(accessibilityLabel);
    mockLastActions = actions.map((action) => action.label);
    return null;
  },
}));

const t = createTranslator('en');
const handlers = {
  onAssignMe: jest.fn(),
  onRemoveMe: jest.fn(),
  onDelete: jest.fn(),
  onPress: jest.fn(),
  onSetState: jest.fn(),
  onToggleCompleted: jest.fn(),
  onUnassign: jest.fn(),
};
const members: never[] = [];

function task(id: string, sortOrder: number): TaskDto {
  return {
    id,
    household_id: 'h1',
    list_id: 'l1',
    title: `Task ${id}`,
    notes: null,
    sort_order: sortOrder,
    completed: false,
    assignee_ids: [],
    assignee_id: null,
    due_at: '2030-10-25T12:00:00Z',
    created_at: '2030-01-01T00:00:00Z',
    updated_at: '2030-01-01T00:00:00Z',
    version: 1,
  };
}

function view(tasks: readonly TaskDto[], isTemplate = false) {
  return (
    <ListTasks
      busy={false}
      isTemplate={isTemplate}
      locale="en"
      handlers={handlers}
      members={members}
      onMove={jest.fn()}
      t={t}
      tasks={tasks}
    />
  );
}

it('renders again only the row whose task changed', async () => {
  // A refetch keeps unchanged task objects, which is what the query cache does.
  const [a, b, c] = [task('a', 1), task('b', 2), task('c', 3)];
  const screen = await render(view([a, b, c]));
  expect(mockMenus).toHaveLength(3);
  mockMenus.length = 0;

  await screen.rerender(view([a, { ...b, title: 'Task b, renamed', version: 2 }, c]));

  expect(mockMenus).toEqual(['Actions for Task b, renamed']);
});

it('gives a template task no completion, assignment or state, only delete', async () => {
  await render(view([{ ...task('a', 1), due_at: null }], true));

  expect(rendered.queryByRole('checkbox')).toBeNull();
  expect(rendered.queryByText('Assign to me')).toBeNull();
  expect(rendered.queryByText('Unassigned')).toBeNull();
  expect(mockLastActions).toEqual(['Delete']);
});

describe('quick add', () => {
  type Listener = (event: KeyboardEvent) => void;
  const listeners = new Map<string, Listener>();

  beforeEach(() => {
    listeners.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, listener: Listener) => {
      listeners.set(name, listener);
      // A previous test's unmount can land late; only drop the listener it added.
      return { remove: () => listeners.get(name) === listener && listeners.delete(name) };
    }) as unknown as typeof Keyboard.addListener);
  });

  afterEach(() => jest.restoreAllMocks());

  async function keyboard(name: 'keyboardDidShow' | 'keyboardDidHide', height = 0): Promise<void> {
    await act(() => {
      listeners.get(name)?.({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: { height, screenX: 0, screenY: 0, width: 400 },
      });
    });
  }

  function bottom(): ViewStyle['bottom'] {
    const style = rendered.getByTestId('quick-add-bar').props.style as StyleProp<ViewStyle>;
    return StyleSheet.flatten(style).bottom;
  }

  it('sits above the tabs, rides on the keyboard while typing, and returns when it closes', async () => {
    // The safe-area mock reports no bottom inset, so the keyboard offset is its height alone.
    await render(<QuickAddBar onAdd={jest.fn()} pending={false} t={t} />);
    const resting = bottom();
    expect(resting).toBeGreaterThanOrEqual(64);

    await keyboard('keyboardDidShow', 300);
    expect(bottom()).toBe(300);

    // An emoji panel re-sends the show event with the new height.
    await keyboard('keyboardDidShow', 360);
    expect(bottom()).toBe(360);

    await keyboard('keyboardDidHide');
    expect(bottom()).toBe(resting);
  });

  it('stops listening once unmounted', async () => {
    const screen = await render(<QuickAddBar onAdd={jest.fn()} pending={false} t={t} />);
    expect(listeners.size).toBe(2);
    await screen.unmount();
    expect(listeners.size).toBe(0);
  });
});
