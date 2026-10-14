import { fireEvent, render, screen } from '@testing-library/react-native';
import type { HouseholdTaskDto } from '@odin/contracts';

import TasksScreen from '../../app/(app)/tasks.tsx';
import { odinWrapper } from '../test-context.tsx';

let mockParams: { view?: string; deadline?: string; blocked?: string } = {};
const mockTasks: HouseholdTaskDto[] = [
  {
    id: 't1',
    household_id: 'h1',
    list_id: 'l1',
    list_title: 'Home',
    title: 'Water plants',
    notes: 'Use rainwater',
    completed: false,
    blocked: false,
    assignee_id: 'u1',
    due_at: null,
    sort_order: 1,
    version: 1,
    created_at: '2030-01-01T10:00:00Z',
    updated_at: '2030-01-01T10:00:00Z',
  },
  {
    id: 't2',
    household_id: 'h1',
    list_id: 'l1',
    list_title: 'Home',
    title: 'Repair shelf',
    notes: null,
    completed: false,
    blocked: true,
    assignee_id: null,
    due_at: '2020-01-01T10:00:00Z',
    sort_order: 2,
    version: 1,
    created_at: '2030-01-01T10:00:00Z',
    updated_at: '2030-01-01T10:00:00Z',
  },
  {
    id: 't3',
    household_id: 'h1',
    list_id: 'l1',
    list_title: 'Home',
    title: 'Done chore',
    notes: null,
    completed: true,
    blocked: false,
    assignee_id: 'u1',
    due_at: null,
    sort_order: 3,
    version: 1,
    created_at: '2030-01-01T10:00:00Z',
    updated_at: '2030-01-01T10:00:00Z',
  },
];
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('../state/queries.ts', () => ({
  NO_MEMBERS: [],
  useHouseholdTasksQuery: () => ({ data: { items: mockTasks }, isPending: false, isError: false }),
  useHomeQuery: () => ({ data: { items: [] } }),
  useProfileQuery: () => ({ data: { display_name: 'Ana' } }),
  useMembersQuery: () => ({ data: [{ user_id: 'u1', display_name: 'Ana', avatar_ref: null }] }),
}));
jest.mock('./useTaskWiring.tsx', () => ({
  useTaskWiring: () => ({ actions: { busy: false }, handlers: {}, overlays: null, errors: null }),
}));

beforeEach(() => {
  mockParams = {};
});

it('combines ownership, search over hidden notes, sheet filters and clear without dropping ownership or search', async () => {
  await render(<TasksScreen />, { wrapper: odinWrapper({ user: { id: 'u1', email: null } }) });
  expect(screen.getByText('Water plants')).toBeTruthy();
  expect(screen.queryByText('Repair shelf')).toBeNull();
  expect(screen.queryByText('Done chore')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search tasks'), 'rainwater');
  expect(screen.getByText('1 tasks')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Filters'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Overdue' }));
  await fireEvent.press(screen.getByLabelText('Apply filters'));
  expect(screen.getByText('No tasks match this filter.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Clear filters'));
  expect(screen.getByText('Water plants')).toBeTruthy();
  expect(screen.getByLabelText('Search tasks')).toHaveDisplayValue('rainwater');
  expect(screen.queryByText('Repair shelf')).toBeNull();
});

it('applies a new Today tile link to an already mounted Tasks screen and keeps Show done exclusive to Everyone', async () => {
  const view = await render(<TasksScreen />, {
    wrapper: odinWrapper({ user: { id: 'u1', email: null } }),
  });
  mockParams = { view: 'everyone', deadline: 'overdue', blocked: '1' };
  await view.rerender(<TasksScreen />);
  expect(screen.getByText('Repair shelf')).toBeTruthy();
  expect(screen.queryByText('Water plants')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Clear filters'));
  await fireEvent.press(screen.getByLabelText('Filters'));
  await fireEvent(screen.getByLabelText('Show done'), 'valueChange', true);
  await fireEvent.press(screen.getByLabelText('Apply filters'));
  expect(screen.getByText('Done chore')).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Mine, 1' }));
  expect(screen.queryByText('Done chore')).toBeNull();
  expect(screen.queryByText('Repair shelf')).toBeNull();
});
