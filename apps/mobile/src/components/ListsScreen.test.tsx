import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { ListSummaryDto } from '@odin/contracts';

import ListsScreen from '../../app/(app)/lists.tsx';
import { odinWrapper } from '../test-context.tsx';

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

const mockLists = [
  list('a', 'Garden', 'active'),
  list('b', 'Moving', 'active'),
  list('t1', 'Weekly', 'template'),
  list('t2', 'Trip', 'template'),
];
let mockParams: { tab?: string } = {};
let mockProjects: { data: unknown; isSuccess: boolean; isError: boolean } = {
  data: undefined,
  isSuccess: false,
  isError: false,
};

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../state/queries.ts', () => ({
  useHomeQuery: () => ({ data: { items: mockLists }, isPending: false, isError: false }),
  useProjectsQuery: () => ({ ...mockProjects, refetch: jest.fn() }),
  useProfileQuery: () => ({ data: { display_name: 'Ana' } }),
  useMembersQuery: () => ({ data: [] }),
  NO_MEMBERS: [],
}));

beforeEach(() => {
  mockParams = {};
  mockProjects = { data: undefined, isSuccess: false, isError: false };
});

async function renderScreen(): Promise<void> {
  const Odin = odinWrapper({ user: { id: 'u1', email: null } });
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactNode => (
    <QueryClientProvider client={new QueryClient()}>
      <Odin>{children}</Odin>
    </QueryClientProvider>
  );
  await render(<ListsScreen />, { wrapper });
}

it('hides Reorder on active lists while the projects are loading', async () => {
  await renderScreen();
  expect(screen.queryByText('Reorder')).toBeNull();
});

it('hides Reorder on active lists when the projects fail to load', async () => {
  mockProjects = { data: undefined, isSuccess: false, isError: true };
  await renderScreen();
  expect(screen.queryByText('Reorder')).toBeNull();
});

it('offers Reorder once the projects are known', async () => {
  mockProjects = { data: { items: [] }, isSuccess: true, isError: false };
  await renderScreen();
  expect(screen.getByText('Reorder')).toBeTruthy();
});

it('offers Reorder on templates without waiting for projects', async () => {
  mockParams = { tab: 'templates' };
  await renderScreen();
  expect(screen.getByText('Reorder')).toBeTruthy();
});
