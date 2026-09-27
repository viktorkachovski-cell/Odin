import { fireEvent, render, screen } from '@testing-library/react-native';

import type { TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { TaskDetailsSheet } from './TaskDetailsSheet.tsx';

const t = createTranslator('en');

const task: TaskDto = {
  id: 't1',
  household_id: 'h1',
  list_id: 'l1',
  title: 'Clean the pantry',
  notes: 'Move every jar, wipe the back shelf, and check expiry dates.',
  sort_order: 1,
  completed: false,
  assignee_id: 'u1',
  due_at: '2030-05-06T14:30:00.000Z',
  created_at: '2030-05-01T10:00:00.000Z',
  updated_at: '2030-05-01T10:00:00.000Z',
  version: 2,
};

describe('TaskDetailsSheet', () => {
  it('shows the full notes, assignee and deadline and opens editing separately', async () => {
    const onEdit = jest.fn();
    const onClose = jest.fn();
    await render(
      <TaskDetailsSheet
        editable
        locale="en"
        members={[{ user_id: 'u1', display_name: 'Ana', avatar_ref: null }]}
        onClose={onClose}
        onEdit={onEdit}
        t={t}
        task={task}
      />,
    );

    expect(screen.getByText(task.notes as string)).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText(/2030/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Edit task'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps template task details read-only', async () => {
    const onEdit = jest.fn();
    await render(
      <TaskDetailsSheet
        editable={false}
        locale="en"
        members={[]}
        onClose={jest.fn()}
        onEdit={onEdit}
        t={t}
        task={{ ...task, assignee_id: null, due_at: null, notes: null }}
      />,
    );

    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.getByText('No deadline')).toBeTruthy();
    expect(screen.queryByLabelText('Edit task')).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });
});
