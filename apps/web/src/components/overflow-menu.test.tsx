import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MemberDto, TaskRowModel } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ConfirmDialog } from './ConfirmDialog.tsx';
import { OverflowMenu, type OverflowItem } from './OverflowMenu.tsx';
import { TaskRow } from './TaskRow.tsx';

/**
 * The overflow menu is the accessibility surface this redesign added, so its
 * keyboard contract is covered here rather than assumed: a row's secondary and
 * destructive actions are now only reachable through it.
 */

const t = createTranslator('en');
const tBg = createTranslator('bg');

const members: MemberDto[] = [{ user_id: 'u1', display_name: 'Ana Petrova', avatar_ref: null }];

function makeTask(overrides: Partial<TaskRowModel> = {}): TaskRowModel {
  return {
    id: 't1',
    list_id: 'l1',
    title: 'Empty the bins',
    completed: false,
    assignee_id: null,
    due_at: null,
    version: 1,
    ...overrides,
  };
}

function items(onEdit = vi.fn(), onDelete = vi.fn()): OverflowItem[] {
  return [
    { key: 'delete', label: 'Delete list', danger: true, onSelect: onDelete },
    { key: 'edit', label: 'Edit list', onSelect: onEdit },
  ];
}

describe('OverflowMenu', () => {
  it('stays closed until asked, and closes again on a second press', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} label="Actions for This week" />);

    const trigger = screen.getByRole('button', { name: 'Actions for This week' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('orders destructive items last whatever order the caller passed', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} label="Actions for This week" />);

    await user.click(screen.getByRole('button', { name: 'Actions for This week' }));
    const labels = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(labels).toEqual(['Edit list', 'Delete list']);
  });

  it('opens on ArrowDown with the first item focused, and on ArrowUp with the last', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} label="Actions for This week" />);

    const trigger = screen.getByRole('button', { name: 'Actions for This week' });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit list' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Delete list' })).toHaveFocus();
  });

  it('roves with the arrow keys and wraps at both ends', async () => {
    const user = userEvent.setup();
    render(<OverflowMenu items={items()} label="Actions for This week" />);

    screen.getByRole('button', { name: 'Actions for This week' }).focus();
    await user.keyboard('{ArrowDown}');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete list' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit list' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Delete list' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Edit list' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete list' })).toHaveFocus();
  });

  it('returns focus to the trigger after choosing an item', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<OverflowMenu items={items(onEdit)} label="Actions for This week" />);

    const trigger = screen.getByRole('button', { name: 'Actions for This week' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Edit list' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when a press lands outside it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <OverflowMenu items={items()} label="Actions for This week" />
        <button type="button">Somewhere else</button>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for This week' }));
    await user.click(screen.getByRole('button', { name: 'Somewhere else' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('TaskRow actions', () => {
  it('shows Edit inline and hides the destructive pair behind the overflow', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onDelete={onDelete}
          onEdit={vi.fn()}
          onToggleCompleted={vi.fn()}
          onUnassign={vi.fn()}
          t={t}
          task={makeTask({ assignee_id: 'u1' })}
        />
      </ul>,
    );

    // Edit is reachable without opening anything; Delete is not.
    expect(screen.getByRole('button', { name: 'Edit Empty the bins' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Empty the bins' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('names the overflow after its own task, so sibling rows are distinguishable', () => {
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onDelete={vi.fn()}
          t={t}
          task={makeTask({ title: 'Water the plants' })}
        />
        <TaskRow
          locale="en"
          members={members}
          onDelete={vi.fn()}
          t={t}
          task={makeTask({ id: 't2', title: 'Take out the recycling' })}
        />
      </ul>,
    );

    expect(
      screen.getByRole('button', { name: 'Actions for Water the plants' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Actions for Take out the recycling' }),
    ).toBeInTheDocument();
  });

  it('offers no unassign entry when the task has nobody on it', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onDelete={vi.fn()}
          onUnassign={vi.fn()}
          t={t}
          task={makeTask({ assignee_id: null })}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Empty the bins' }));
    expect(screen.queryByRole('menuitem', { name: 'Unassign' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders no action group at all for a read-only template row', () => {
    render(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask()} />
      </ul>,
    );

    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('focuses Cancel on open so Enter never destroys anything', () => {
    render(
      <ConfirmDialog
        body={t('list.delete.confirm')}
        confirmLabel={t('list.delete')}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        pending={false}
        t={t}
        title={t('list.delete.title')}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('confirms only when the destructive button is pressed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        body={t('task.delete.confirm')}
        confirmLabel={t('task.delete.short')}
        onCancel={onCancel}
        onConfirm={onConfirm}
        pending={false}
        t={t}
        title={t('task.delete.title')}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete this task permanently?')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables the destructive button while the command is in flight', () => {
    render(
      <ConfirmDialog
        body={t('list.delete.confirm')}
        confirmLabel={t('list.delete')}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        pending
        t={t}
        title={t('list.delete.title')}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete list' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('is fully translated, so no browser-chrome English leaks into Bulgarian', () => {
    render(
      <ConfirmDialog
        body={tBg('list.delete.confirm')}
        confirmLabel={tBg('list.delete')}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        pending={false}
        t={tBg}
        title={tBg('list.delete.title')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Да изтрия ли този списък?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отказ' })).toBeInTheDocument();
  });
});
