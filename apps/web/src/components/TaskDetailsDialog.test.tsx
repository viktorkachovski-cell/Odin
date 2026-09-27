import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

const { useTaskQuery } = vi.hoisted(() => ({ useTaskQuery: vi.fn() }));
vi.mock('../app/queries.ts', () => ({ useTaskQuery }));

import { TaskDetailsDialog } from './TaskDetailsDialog.tsx';

const t = createTranslator('en');
const task: TaskDto = {
  id: 'task-1',
  household_id: 'household-1',
  list_id: 'list-1',
  title: 'Water the plants',
  notes: 'Use the small watering can',
  sort_order: 1,
  completed: false,
  assignee_id: 'member-1',
  due_at: '2030-04-05T15:30:00.000Z',
  created_at: '2030-04-01T10:00:00.000Z',
  updated_at: '2030-04-01T10:00:00.000Z',
  version: 2,
};
const members: MemberDto[] = [{ user_id: 'member-1', display_name: 'Ana', avatar_ref: null }];

describe('TaskDetailsDialog', () => {
  beforeEach(() => {
    useTaskQuery.mockReturnValue({
      data: task,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
  });

  it('shows notes, assignee and deadline and opens the active-task editor', async () => {
    const onEdit = vi.fn();
    render(
      <TaskDetailsDialog
        canEdit
        locale="en"
        members={members}
        onClose={vi.fn()}
        onEdit={onEdit}
        t={t}
        taskId={task.id}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Water the plants' });
    expect(dialog).toHaveTextContent('Use the small watering can');
    expect(dialog).toHaveTextContent('Ana');
    expect(dialog).toHaveTextContent(/5 Apr 2030/);
    await userEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    expect(onEdit).toHaveBeenCalledWith(task);
  });
});
