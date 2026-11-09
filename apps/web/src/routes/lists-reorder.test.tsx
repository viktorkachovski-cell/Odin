import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListSummaryDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

/**
 * Active lists move only within their project, so the Lists screen offers
 * Reorder only once it knows the projects. Until then it would show grouped
 * lists flat and the arrows would point at the wrong neighbours.
 */

function list(id: string, title: string, kind: 'active' | 'template'): ListSummaryDto {
  return {
    id,
    kind,
    title,
    subtitle: null,
    notes: null,
    status: 'open',
    version: 1,
    total_tasks: 0,
    completed_tasks: 0,
  };
}

const lists = [
  list('a', 'Garden', 'active'),
  list('b', 'Moving', 'active'),
  list('t1', 'Weekly', 'template'),
  list('t2', 'Trip', 'template'),
];
interface ProjectsState {
  readonly data: { readonly items: readonly never[] } | undefined;
  readonly isSuccess: boolean;
  readonly isError: boolean;
}
const projects = vi.hoisted(() => {
  const state: ProjectsState = { data: undefined, isSuccess: false, isError: false };
  return { state };
});

vi.mock('../app/queries.ts', () => ({
  useHomeQuery: () => ({ data: { items: lists }, isPending: false, isError: false }),
  useProjectsQuery: () => ({ ...projects.state, refetch: vi.fn() }),
}));
vi.mock('../app/OdinContext.ts', () => ({
  useOdin: () => ({ t: createTranslator('en'), client: { rpc: vi.fn() } }),
}));

import { Lists } from './Lists.tsx';

function renderLists(path = '/lists') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Lists />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

describe('Lists reorder', () => {
  beforeEach(() => {
    projects.state = { data: undefined, isSuccess: false, isError: false };
  });

  it('hides Reorder on active lists while the projects are loading', () => {
    renderLists();
    expect(screen.queryByRole('button', { name: 'Reorder' })).toBeNull();
  });

  it('hides Reorder on active lists when the projects fail to load', () => {
    projects.state = { data: undefined, isSuccess: false, isError: true };
    renderLists();
    expect(screen.queryByRole('button', { name: 'Reorder' })).toBeNull();
  });

  it('offers Reorder once the projects are known', () => {
    projects.state = { data: { items: [] }, isSuccess: true, isError: false };
    renderLists();
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeTruthy();
  });

  it('offers Reorder on templates without waiting for projects', () => {
    renderLists('/lists?tab=templates');
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeTruthy();
  });
});
