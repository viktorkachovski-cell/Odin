import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ListTasks } from './ListDetailParts.tsx';

const t = createTranslator('en');
const members: MemberDto[] = [];
const tasks: TaskDto[] = [
  {
    id: 't1',
    household_id: 'h1',
    list_id: 'l1',
    title: 'First',
    notes: null,
    sort_order: 1,
    completed: false,
    assignee_id: null,
    due_at: null,
    created_at: '',
    updated_at: '',
    version: 1,
  },
  {
    id: 't2',
    household_id: 'h1',
    list_id: 'l1',
    title: 'Second',
    notes: null,
    sort_order: 2,
    completed: false,
    assignee_id: 'u1',
    due_at: null,
    created_at: '',
    updated_at: '',
    version: 1,
  },
  {
    id: 't3',
    household_id: 'h1',
    list_id: 'l1',
    title: 'Finished',
    notes: null,
    sort_order: 1,
    completed: true,
    assignee_id: null,
    due_at: null,
    created_at: '',
    updated_at: '',
    version: 1,
  },
];

describe('ListTasks', () => {
  it('keeps moves inside completion groups and submits the chosen task status', async () => {
    const user = userEvent.setup();
    const onMoveTask = vi.fn();
    const onSetStatus = vi.fn();
    render(
      <ListTasks
        busy={false}
        isTemplate={false}
        locale="en"
        members={members}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onMoveTask={onMoveTask}
        onOpenDetails={vi.fn()}
        onSetStatus={onSetStatus}
        onToggleCompleted={vi.fn()}
        onUnassign={vi.fn()}
        t={t}
        tasks={tasks}
      />,
    );

    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Finished up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Second up' }));
    expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'up');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Change status for Second' }),
      'blocked',
    );
    expect(onSetStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'blocked');
  });
});
