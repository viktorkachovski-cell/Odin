import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { HouseholdTaskDto, ListSummaryDto, MemberDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

/**
 * Today and Tasks derive everything from one household read, so these tests
 * drive both screens from a fixed set of tasks and check what a member sees:
 * the counts, which view shows which task, and that filters combine.
 */

const now = new Date();
const day = (offset: number, hour = 23, minute = 59): string =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute).toISOString();

function task(id: string, overrides: Partial<HouseholdTaskDto> = {}): HouseholdTaskDto {
  return {
    id,
    household_id: 'h1',
    list_id: 'l1',
    list_title: 'Home',
    title: `Task ${id}`,
    notes: null,
    sort_order: 1,
    completed: false,
    blocked: false,
    assignee_id: null,
    due_at: null,
    created_at: '',
    updated_at: '',
    version: 1,
    ...overrides,
  };
}

const tasks: HouseholdTaskDto[] = [
  task('late', { title: 'Pay the bill', assignee_id: 'me', due_at: day(-2) }),
  task('free', { title: 'Take out recycling', due_at: day(2) }),
  task('theirs', { title: 'Book lessons', assignee_id: 'other', blocked: true, notes: 'Waiting' }),
  task('done', { title: 'Buy oil', assignee_id: 'me', completed: true }),
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
    total_tasks: 4,
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
  // jsdom has no matchMedia; the compact-viewport chrome asks for it.
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
    .map((row) => within(row).queryByRole('button', { name: /^(?!Mark|Claim|Actions)/ }))
    .flatMap((button) => (button === null ? [] : [button.textContent ?? '']));
}

describe('Tasks', () => {
  it('shows only the member’s open tasks by default, with counts on every view', () => {
    renderAt('/tasks');

    expect(rowTitles()).toEqual(['Pay the bill']);
    expect(screen.getByRole('button', { name: 'Mine 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Unassigned 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Everyone 3' })).toBeInTheDocument();
  });

  it('groups by deadline and spells out overdue', () => {
    renderAt('/tasks?view=everyone');

    expect(screen.getByRole('heading', { name: 'Overdue · 1' })).toBeInTheDocument();
    expect(screen.getByText(/^Overdue · /, { selector: '.overdue' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No deadline · 1' })).toBeInTheDocument();
  });

  it('combines view, search and the done toggle', async () => {
    const user = userEvent.setup();
    renderAt('/tasks?view=everyone');

    expect(rowTitles()).not.toContain('Buy oil');
    await user.click(screen.getByRole('checkbox', { name: 'Show done' }));
    expect(rowTitles()).toContain('Buy oil');

    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'waiting');
    expect(rowTitles()).toEqual(['Book lessons']);
  });

  it('opens with a tile’s filter already applied', () => {
    renderAt('/tasks?view=everyone&blocked=1');

    expect(rowTitles()).toEqual(['Book lessons']);
    expect(screen.getByRole('button', { name: 'Blocked only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('Today', () => {
  it('counts open work and lists only the member’s own tasks', () => {
    renderAt('/');

    expect(screen.getByRole('link', { name: 'Overdue: 1' })).toHaveAttribute(
      'href',
      '/tasks?view=everyone&deadline=overdue',
    );
    expect(screen.getByRole('link', { name: 'Unassigned: 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Blocked: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim Take out recycling' })).toBeInTheDocument();
    expect(screen.queryByText('Book lessons')).not.toBeInTheDocument();
  });
});
