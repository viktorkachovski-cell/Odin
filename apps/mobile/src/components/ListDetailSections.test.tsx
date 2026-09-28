import { render } from '@testing-library/react-native';

import type { TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ListTasks } from './ListDetailSections.tsx';

/** Each task row renders one action menu, so the menu counts row renders. */
const mockMenus: string[] = [];
jest.mock('./ActionMenu.tsx', () => ({
  ActionMenu: ({ accessibilityLabel }: { readonly accessibilityLabel: string }) => {
    mockMenus.push(accessibilityLabel);
    return null;
  },
}));

const t = createTranslator('en');
const handlers = {
  onDelete: jest.fn(),
  onEdit: jest.fn(),
  onMove: jest.fn(),
  onOpen: jest.fn(),
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

function view(tasks: readonly TaskDto[]) {
  return (
    <ListTasks
      busy={false}
      isTemplate={false}
      locale="en"
      members={members}
      t={t}
      tasks={tasks}
      {...handlers}
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
