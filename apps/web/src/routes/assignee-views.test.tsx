import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { HouseholdTaskDto, ListSummaryDto, MemberDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

/**
 * Several assignees across the screens the member lives in: a shared task is
 * once in each assignee's Mine, once in Everyone, once in every count, and
 * Unassigned means nobody.
 */

function task(
  id: string,
  title: string,
  assignees: readonly string[],
  overrides: Partial<HouseholdTaskDto> = {},
): HouseholdTaskDto {
  return {
    id,
    household_id: 'h1',
    list_id: 'l1',
    list_title: 'Home',
    title,
    notes: null,
    sort_order: 1,
    completed: false,
    blocked: false,
    assignee_ids: assignees,
    assignee_id: assignees[0] ?? null,
    due_at: null,
    created_at: '',
    updated_at: '',
    version: 1,
    ...overrides,
  };
}

const tasks: HouseholdTaskDto[] = [
  task('shared', 'Clean the garage', ['me', 'other']),
  task('solo', 'Pay the bill', ['me']),
  task('theirs', 'Book lessons', ['other']),
  task('nobody', 'Take out recycling', []),
  task('finished', 'Buy oil', ['me', 'other'], { completed: true }),
];
const lists: ListSummaryDto[] = [
  {
    id: 'l1',
    kind: 'active',
    title: 'Home',
    subtitle: null,
    notes: null,
    status: 'open',
    version: 1,
    total_tasks: 5,
    completed_tasks: 1,
  },
];
const members: MemberDto[] = [
  { user_id: 'me', display_name: 'Alex', avatar_ref: null },
  { user_id: 'other', display_name: 'Mira', avatar_ref: null },
];

vi.mock('../app/queries.ts', () => ({
  useHouseholdTasksQuery: () => ({ data: { items: tasks }, isPending: false, isError: false }),
  useHomeQuery: () => ({ data: { items: lists }, isPending: false, isError: false }),
  useMembersQuery: () => ({ data: members }),
  useTaskQuery: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock('../app/OdinContext.ts', () => ({
  useOdin: () => ({
    t: createTranslator('en'),
    locale: 'en',
    user: { id: 'me' },
    client: { rpc: vi.fn() },
  }),
}));

import { Tasks } from './Tasks.tsx';
import { Today } from './Today.tsx';

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

function renderAt(path: string): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Today />} path="/" />
          <Route element={<Tasks />} path="/tasks" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowTitles(): string[] {
  return screen
    .queryAllByRole('listitem')
    .map((row) => within(row).queryByRole('button', { name: /^(?!Mark|Assign|Actions)/ }))
    .flatMap((button) => (button === null ? [] : [button.textContent ?? '']));
}

describe('Tasks with a shared task', () => {
  it('lists the shared task once in Mine, and counts it once everywhere', () => {
    renderAt('/tasks');
    expect(rowTitles().sort()).toEqual(['Clean the garage', 'Pay the bill']);
    expect(screen.getByRole('button', { name: 'Mine 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unassigned 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Everyone 4' })).toBeInTheDocument();
  });

  it('keeps Unassigned to tasks nobody has', () => {
    renderAt('/tasks?view=unassigned');
    expect(rowTitles()).toEqual(['Take out recycling']);
  });

  it('shows the shared task once in Everyone with every assignee named', () => {
    renderAt('/tasks?view=everyone');
    expect(rowTitles().filter((title) => title === 'Clean the garage')).toHaveLength(1);
    const row = screen.getByRole('button', { name: 'Clean the garage' }).closest('li');
    expect(row).not.toBeNull();
    if (row === null) return;
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).getByText('Mira')).toBeInTheDocument();
  });
});

describe('Today with a shared task', () => {
  it('counts the shared task once and shows it among my tasks', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Unassigned: 1' })).toBeInTheDocument();
    expect(screen.getByText('Clean the garage')).toBeInTheDocument();
    expect(screen.queryByText('Book lessons')).not.toBeInTheDocument();
  });
});
