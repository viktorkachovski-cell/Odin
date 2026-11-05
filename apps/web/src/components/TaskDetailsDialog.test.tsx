import { render, screen } from '@testing-library/react';
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
  assignee_ids: ['member-1'],
  assignee_id: 'member-1',
  due_at: '2030-04-05T15:30:00.000Z',
  created_at: '2030-04-01T10:00:00.000Z',
  updated_at: '2030-04-01T10:00:00.000Z',
  version: 2,
};
const members: MemberDto[] = [
  { user_id: 'member-1', display_name: 'Ana', avatar_ref: null },
  { user_id: 'member-2', display_name: 'Ana', avatar_ref: null },
];

describe('TaskDetailsDialog', () => {
  beforeEach(() => {
    useTaskQuery.mockReturnValue({
      data: task,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
  });

  it('shows notes, assignee and deadline read-only', () => {
    render(
      <TaskDetailsDialog locale="en" members={members} onClose={vi.fn()} t={t} taskId={task.id} />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Water the plants' });
    expect(dialog).toHaveTextContent('Use the small watering can');
    expect(dialog).toHaveTextContent('Ana');
    expect(dialog).toHaveTextContent(/5 Apr 2030/);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Close']);
  });

  it('lists every assignee, telling two members with one name apart', () => {
    useTaskQuery.mockReturnValue({
      data: { ...task, assignee_ids: ['member-1', 'member-2'], assignee_id: 'member-1' },
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    render(
      <TaskDetailsDialog locale="en" members={members} onClose={vi.fn()} t={t} taskId={task.id} />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Ana$/);
    expect(items[1]).toHaveTextContent('Ana (2)');
  });

  it('says Unassigned when nobody is assigned', () => {
    useTaskQuery.mockReturnValue({
      data: { ...task, assignee_ids: [], assignee_id: null },
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    render(
      <TaskDetailsDialog locale="en" members={members} onClose={vi.fn()} t={t} taskId={task.id} />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Unassigned');
  });
});
