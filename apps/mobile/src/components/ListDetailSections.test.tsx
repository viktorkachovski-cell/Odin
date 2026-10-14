import { render, screen as rendered } from '@testing-library/react-native';

import type { TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ListTasks } from './ListDetailSections.tsx';

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
  onClaim: jest.fn(),
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

it('gives a template task no completion, claim or state, only delete', async () => {
  await render(view([{ ...task('a', 1), due_at: null }], true));

  expect(rendered.queryByRole('checkbox')).toBeNull();
  expect(rendered.queryByText('Claim')).toBeNull();
  expect(rendered.queryByText('Unassigned')).toBeNull();
  expect(mockLastActions).toEqual(['Delete']);
});
