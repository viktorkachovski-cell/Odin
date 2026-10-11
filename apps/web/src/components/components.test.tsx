import { render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MemberDto, TaskRowModel } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { Dialog } from './Dialog.tsx';
import { TaskRow } from './TaskRow.tsx';

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

describe('TaskRow', () => {
  it('toggles completion without ever opening the task', async () => {
    const onToggleCompleted = vi.fn();
    const onOpenDetails = vi.fn();
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onOpenDetails={onOpenDetails}
          onToggleCompleted={onToggleCompleted}
          t={t}
          task={makeTask()}
        />
      </ul>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mark Empty the bins complete' }));

    expect(onToggleCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), true);
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it('sends the explicit desired state rather than a toggle', async () => {
    const onToggleCompleted = vi.fn();
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onToggleCompleted={onToggleCompleted}
          t={t}
          task={makeTask({ completed: true })}
        />
      </ul>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mark Empty the bins not complete' }));
    expect(onToggleCompleted).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('exposes completion state to assistive technology', () => {
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onToggleCompleted={vi.fn()}
          t={t}
          task={makeTask({ completed: true })}
        />
      </ul>,
    );
    expect(screen.getByRole('button', { name: /not complete/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('spells out overdue instead of relying on colour', () => {
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          t={t}
          task={makeTask({ due_at: '2020-01-01T09:00:00.000Z' })}
        />
      </ul>,
    );
    expect(screen.getByText(/Overdue/)).toBeDefined();
  });

  it('never marks a completed task overdue', () => {
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          t={t}
          task={makeTask({ due_at: '2020-01-01T09:00:00.000Z', completed: true })}
        />
      </ul>,
    );
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it('shows the assignee name in full beside the avatar', () => {
    render(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask({ assignee_id: 'u1' })} />
      </ul>,
    );
    expect(screen.getByText('Ana Petrova')).toBeDefined();
  });

  it('names an unclaimed task as unassigned for assistive technology only', () => {
    render(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask()} />
      </ul>,
    );
    expect(screen.getByText('Unassigned')).toHaveClass('visually-hidden');
  });

  it('shows a status label only when the task is blocked', () => {
    const { rerender } = render(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask({ blocked: false })} />
      </ul>,
    );
    expect(screen.queryByText('Blocked')).toBeNull();
    rerender(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask({ blocked: true })} />
      </ul>,
    );
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('leaves an undated deadline empty instead of saying so on every row', () => {
    render(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask()} />
      </ul>,
    );
    expect(screen.queryByText('No deadline')).toBeNull();
  });

  it('gives the claim action a descriptive accessible name in Bulgarian', () => {
    render(
      <ul>
        <TaskRow
          locale="bg"
          members={members}
          onClaim={vi.fn()}
          t={tBg}
          task={makeTask({ title: 'Изхвърляне на боклука' })}
        />
      </ul>,
    );
    const claim = screen.getByRole('button', { name: 'Поеми Изхвърляне на боклука' });
    // The visible label stays short; the title lives in the accessible name.
    expect(claim).toHaveTextContent(tBg('task.claim.short'));
  });

  it('shows move controls only in reorder mode', () => {
    const { rerender } = render(
      <ul>
        <TaskRow locale="en" members={members} t={t} task={makeTask()} />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: 'Move Empty the bins up' })).toBeNull();
    rerender(
      <ul>
        <TaskRow locale="en" members={members} onMove={vi.fn()} t={t} task={makeTask()} />
      </ul>,
    );
    expect(screen.getByRole('button', { name: 'Move Empty the bins up' })).toBeInTheDocument();
  });

  it('opens full task details from the title without toggling completion', async () => {
    const onOpenDetails = vi.fn();
    const onToggleCompleted = vi.fn();
    render(
      <ul>
        <TaskRow
          locale="en"
          members={members}
          onOpenDetails={onOpenDetails}
          onToggleCompleted={onToggleCompleted}
          t={t}
          task={makeTask()}
        />
      </ul>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Empty the bins' }));

    expect(onOpenDetails).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(onToggleCompleted).not.toHaveBeenCalled();
  });
});

describe('Dialog', () => {
  it('closes on Escape without saving', async () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} title="Edit task">
        <button type="button">Inside</button>
      </Dialog>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog and returns it to the trigger on close', async () => {
    function Harness(): ReactNode {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Open
          </button>
          {open && (
            <Dialog onClose={() => setOpen(false)} title="Edit task">
              <button type="button">Inside</button>
            </Dialog>
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Inside' })).toBe(document.activeElement);

    await userEvent.keyboard('{Escape}');
    expect(trigger).toBe(document.activeElement);
  });

  it('is announced as a modal with an accessible name', () => {
    render(
      <Dialog onClose={vi.fn()} title="Edit task">
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Edit task');
  });
});
