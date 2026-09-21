import { fireEvent, render, screen } from '@testing-library/react-native';

import type { TaskRowModel } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { TaskRow } from './TaskRow.tsx';

const t = createTranslator('en');

const members = [{ user_id: 'u1', display_name: 'Ana', avatar_ref: null }];

function row(overrides: Partial<TaskRowModel> = {}): TaskRowModel {
  return {
    id: 't1',
    title: 'Bathroom',
    completed: false,
    assignee_id: null,
    due_at: null,
    version: 3,
    list_id: 'l1',
    ...overrides,
  };
}

describe('TaskRow', () => {
  it('keeps completion and editing as separate controls', async () => {
    const onToggleCompleted = jest.fn();
    const onEdit = jest.fn();
    await render(
      <TaskRow
        locale="en"
        members={members}
        onEdit={onEdit}
        onToggleCompleted={onToggleCompleted}
        t={t}
        task={row()}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Mark Bathroom complete'));

    expect(onToggleCompleted).toHaveBeenCalledTimes(1);
    // Completing a task must never also open its editor.
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('sends an explicit desired state rather than a toggle', async () => {
    const onToggleCompleted = jest.fn();
    await render(
      <TaskRow
        locale="en"
        members={members}
        onToggleCompleted={onToggleCompleted}
        t={t}
        task={row({ completed: true })}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Mark Bathroom not complete'));

    expect(onToggleCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), false);
  });

  it('exposes completion as a checkbox state for TalkBack', async () => {
    await render(
      <TaskRow
        locale="en"
        members={members}
        onToggleCompleted={jest.fn()}
        t={t}
        task={row({ completed: true })}
      />,
    );

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('spells out an overdue deadline instead of signalling it by colour', async () => {
    await render(
      <TaskRow
        locale="en"
        members={members}
        t={t}
        task={row({ due_at: '2020-01-01T10:00:00.000Z' })}
      />,
    );

    expect(screen.getByText(/Overdue/)).toBeTruthy();
  });

  it('never calls a completed task overdue', async () => {
    await render(
      <TaskRow
        locale="en"
        members={members}
        t={t}
        task={row({ completed: true, due_at: '2020-01-01T10:00:00.000Z' })}
      />,
    );

    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it('names the assignee in text, never by avatar alone', async () => {
    await render(<TaskRow locale="en" members={members} t={t} task={row({ assignee_id: 'u1' })} />);

    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('marks an unassigned task explicitly', async () => {
    await render(<TaskRow locale="en" members={members} t={t} task={row()} />);

    expect(screen.getByText('Unassigned')).toBeTruthy();
  });

  it('offers no completion or edit control on a read-only template row', async () => {
    await render(<TaskRow locale="en" members={members} t={t} task={row()} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('Edit Bathroom')).toBeNull();
  });

  it('keeps secondary task actions in an Android overflow menu', async () => {
    const onEdit = jest.fn();
    const onUnassign = jest.fn();
    await render(
      <TaskRow
        locale="en"
        members={members}
        onEdit={onEdit}
        onUnassign={onUnassign}
        t={t}
        task={row({ assignee_id: 'u1' })}
      />,
    );

    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Actions for Bathroom'));
    await fireEvent.press(screen.getByText('Unassign'));

    expect(onUnassign).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
