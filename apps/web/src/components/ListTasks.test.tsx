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

function renderList(isTemplate: boolean, reorder = true) {
  const onMoveTask = vi.fn();
  const onSetState = vi.fn();
  const onDeleteDone = vi.fn();
  render(
    <ListTasks
      busy={false}
      handlers={{
        onOpenDetails: vi.fn(),
        onSetState,
        onToggleCompleted: vi.fn(),
        onDelete: vi.fn(),
        onUnassign: vi.fn(),
      }}
      isTemplate={isTemplate}
      locale="en"
      members={members}
      onDeleteDone={isTemplate ? undefined : onDeleteDone}
      onMoveTask={onMoveTask}
      reorder={reorder}
      t={t}
      tasks={isTemplate ? tasks.filter((task) => !task.completed) : tasks}
    />,
  );
  return { onMoveTask, onSetState, onDeleteDone };
}

describe('ListTasks', () => {
  it('keeps moves inside completion groups and sets state from the row menu', async () => {
    const user = userEvent.setup();
    const { onMoveTask, onSetState } = renderList(false);
    expect(screen.queryByRole('button', { name: 'Delete done' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Finished up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Second up' }));
    expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'up');

    await user.click(screen.getByRole('button', { name: 'Actions for Second' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark blocked' }));
    expect(onSetState).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }), 'blocked');
  });

  it('hides move controls outside reorder mode and collapses completed tasks', async () => {
    const user = userEvent.setup();
    renderList(false, false);

    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done · 1' }));
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('offers deleting exactly the done tasks', async () => {
    const user = userEvent.setup();
    const { onDeleteDone } = renderList(false, false);

    await user.click(screen.getByRole('button', { name: 'Delete done' }));
    expect(onDeleteDone).toHaveBeenCalledWith([expect.objectContaining({ id: 't3' })]);
  });

  it('lets a template reorder its tasks without offering any runtime state', async () => {
    const user = userEvent.setup();
    const { onMoveTask } = renderList(true);

    expect(screen.queryByRole('button', { name: 'Delete done' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move First down' }));
    expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'down');
  });
});
