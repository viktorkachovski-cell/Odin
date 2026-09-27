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
  assignee_id: null,
  due_at: null,
  created_at: '2030-04-01T10:00:00.000Z',
  updated_at: '2030-04-01T10:00:00.000Z',
  version: 2,
};
const members: MemberDto[] = [];

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

    render(<TaskDetailsFlow canEdit members={members} onClose={onClose} taskId={task.id} />, {
      wrapper,
    });

    await user.click(screen.getByRole('button', { name: 'Edit task' }));
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
      'update_task_v2',
      expect.objectContaining({ expected_version: 3, title: 'Water every plant' }),
    );
  });

  it('offers no editor for a template task', () => {
    useTaskQuery.mockReturnValue({
      data: task,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    render(
      <TaskDetailsFlow canEdit={false} members={members} onClose={vi.fn()} taskId={task.id} />,
      { wrapper },
    );
    expect(screen.queryByRole('button', { name: 'Edit task' })).not.toBeInTheDocument();
  });
});
