import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

const { useTaskQuery, rpc } = vi.hoisted(() => ({ useTaskQuery: vi.fn(), rpc: vi.fn() }));
vi.mock('../app/queries.ts', () => ({ useTaskQuery }));
vi.mock('../app/OdinContext.ts', () => ({
  useOdin: () => ({ t: createTranslator('en'), locale: 'en', client: { rpc } }),
}));

import { TaskDetailsFlow } from './TaskDetailsFlow.tsx';

const task: TaskDto = {
  id: 'task-1',
  household_id: 'household-1',
  list_id: 'list-1',
  title: 'Water the plants',
  notes: null,
  sort_order: 1,
  completed: false,
  blocked: false,
  assignee_ids: [],
  assignee_id: null,
  due_at: null,
  created_at: '2030-04-01T10:00:00.000Z',
  updated_at: '2030-04-01T10:00:00.000Z',
  version: 2,
};
const members: MemberDto[] = [
  { user_id: 'ana', display_name: 'Ana', avatar_ref: null },
  { user_id: 'boris', display_name: 'Boris', avatar_ref: null },
  { user_id: 'cara', display_name: 'Cara', avatar_ref: null },
];

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('TaskDetailsFlow', () => {
  it('keeps the draft through a conflict and resubmits against the latest version', async () => {
    const user = userEvent.setup();
    const latest = { ...task, title: 'Water the garden', version: 3 };
    const refetch = vi.fn().mockResolvedValue({ data: latest });
    useTaskQuery.mockReturnValue({ data: task, isError: false, isPending: false, refetch });
    rpc
      .mockResolvedValueOnce({
        data: {
          ok: false,
          error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 3 },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, data: { ...latest, version: 4 } }, error: null });
    const onClose = vi.fn();

    render(
      <TaskDetailsFlow members={members} onClose={onClose} taskId={task.id} textOnly={false} />,
      { wrapper },
    );

    // The panel opens straight into the editor: no read-only step first.
    const title = screen.getByLabelText('Task title');
    await user.clear(title);
    await user.type(title, 'Water every plant');
    await user.click(screen.getByRole('button', { name: 'Save task' }));

    await user.click(await screen.findByRole('button', { name: 'Review latest' }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.getByLabelText('Task title')).toHaveValue('Water every plant');

    await user.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rpc).toHaveBeenLastCalledWith(
      'update_task_v3',
      expect.objectContaining({ expected_version: 3, title: 'Water every plant' }),
    );
  });

  it('edits a template task as text only', async () => {
    const user = userEvent.setup();
    useTaskQuery.mockReturnValue({
      data: task,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    rpc.mockReset().mockResolvedValueOnce({
      data: { ok: true, data: { ...task, title: 'Water the ferns', version: 3 } },
      error: null,
    });
    const onClose = vi.fn();
    render(<TaskDetailsFlow members={members} onClose={onClose} taskId={task.id} textOnly />, {
      wrapper,
    });

    expect(screen.queryByLabelText('Assigned to')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
    const title = screen.getByLabelText('Task title');
    await user.clear(title);
    await user.type(title, 'Water the ferns');
    await user.type(screen.getByLabelText('Notes (optional)'), 'Mist, do not soak');
    await user.click(screen.getByRole('button', { name: 'Save task' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rpc).toHaveBeenLastCalledWith(
      'update_task_v3',
      expect.objectContaining({
        title: 'Water the ferns',
        notes: 'Mist, do not soak',
        assignee_ids: [],
        due_at: null,
      }),
    );
  });

  it("carries the member's own assignee changes onto the latest version after a conflict", async () => {
    const user = userEvent.setup();
    const opened = { ...task, assignee_ids: ['ana'], assignee_id: 'ana', version: 2 };
    // While the editor was open someone else added Cara.
    const latest = { ...opened, assignee_ids: ['ana', 'cara'], version: 3 };
    const refetch = vi.fn().mockResolvedValue({ data: latest });
    useTaskQuery.mockReturnValue({ data: opened, isError: false, isPending: false, refetch });
    rpc
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          ok: false,
          error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 3 },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, data: { ...latest, version: 4 } }, error: null });
    const onClose = vi.fn();

    render(
      <TaskDetailsFlow members={members} onClose={onClose} taskId={task.id} textOnly={false} />,
      { wrapper },
    );
    // The member adds Boris; the save conflicts.
    await user.click(screen.getByRole('checkbox', { name: /Boris/ }));
    await user.click(screen.getByRole('button', { name: 'Save task' }));
    await user.click(await screen.findByRole('button', { name: 'Review latest' }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());

    // Boris stays selected and so does Cara, whom the member never saw.
    expect(screen.getByRole('checkbox', { name: /Boris/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Cara/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ana/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rpc).toHaveBeenLastCalledWith(
      'update_task_v3',
      expect.objectContaining({ expected_version: 3, assignee_ids: ['ana', 'boris', 'cara'] }),
    );
  });

  it('saves zero, one and several assignees through the editor', async () => {
    const user = userEvent.setup();
    useTaskQuery.mockReturnValue({
      data: task,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    rpc
      .mockReset()
      .mockResolvedValue({ data: { ok: true, data: { ...task, version: 3 } }, error: null });

    render(
      <TaskDetailsFlow members={members} onClose={vi.fn()} taskId={task.id} textOnly={false} />,
      { wrapper },
    );
    await user.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ assignee_ids: [] });

    await user.click(screen.getByRole('checkbox', { name: /Cara/ }));
    await user.click(screen.getByRole('checkbox', { name: /Ana/ }));
    expect(screen.getByTestId('assignee-summary')).toHaveTextContent('Ana, Cara');
    await user.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ assignee_ids: ['ana', 'cara'] });
  });
});
