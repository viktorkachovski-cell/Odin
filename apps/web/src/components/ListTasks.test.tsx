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

function renderList(isTemplate: boolean) {
  const onMoveTask = vi.fn();
  const onSetState = vi.fn();
  render(
    <ListTasks
      busy={false}
      isTemplate={isTemplate}
      locale="en"
      members={members}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onMoveTask={onMoveTask}
      onOpenDetails={vi.fn()}
      onSetState={onSetState}
      onToggleCompleted={vi.fn()}
      onUnassign={vi.fn()}
      t={t}
      tasks={isTemplate ? tasks.filter((task) => !task.completed) : tasks}
    />,
  );
  return { onMoveTask, onSetState };
}

describe('ListTasks', () => {
  it('keeps moves inside completion groups and submits the chosen task state', async () => {
    const user = userEvent.setup();
    const { onMoveTask, onSetState } = renderList(false);

    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Finished up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Second up' }));
    expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'up');
    const status = screen.getByRole('combobox', { name: 'Change status for Second' });
    // An assigned open task reads To-do; the option sends the stored state.
    expect(status).toHaveDisplayValue('To-do');
    await user.selectOptions(status, 'Blocked');
    expect(onSetState).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'blocked');
    expect(screen.getByRole('combobox', { name: 'Change status for First' })).toHaveDisplayValue(
      'Unassigned',
    );
  });

  it('lets a template reorder its tasks without offering any runtime state', async () => {
    const user = userEvent.setup();
    const { onMoveTask } = renderList(true);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Complete|Mark/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move First down' }));
    expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'down');
  });
});
