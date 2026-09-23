import { fireEvent, render, screen } from '@testing-library/react-native';

import type { TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

jest.mock('./TaskTemplates.tsx', () => ({ TaskTemplates: () => null }));

import { TaskEditor, type TaskEditorProps } from './TaskEditor.tsx';

const task: TaskDto = {
  id: 'task-1',
  household_id: 'home-1',
  list_id: 'list-1',
  title: 'Old title',
  notes: 'Old notes',
  sort_order: 1,
  completed: false,
  assignee_id: null,
  due_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 1,
};
const latest: TaskDto = { ...task, title: 'Server title', notes: 'Server notes', version: 2 };

it('keeps the draft through conflict review and saves the chosen fields', async () => {
  const onSubmit = jest.fn();
  const props: TaskEditorProps = {
    task,
    members: [],
    locale: 'en',
    t: createTranslator('en'),
    pending: false,
    error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 2 },
    conflict: true,
    latestTask: null,
    reviewingConflict: false,
    reviewError: false,
    onCancel: jest.fn(),
    onReviewConflict: jest.fn(),
    onSubmit,
  };
  const view = await render(<TaskEditor {...props} />);
  await fireEvent.changeText(screen.getByDisplayValue('Old title'), 'My title');
  expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();

  await view.rerender(<TaskEditor {...props} conflict={false} error={null} latestTask={latest} />);
  expect(screen.getByDisplayValue('My title')).toBeTruthy();
  expect(screen.getByText(/Server title/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: 'Task title: My draft' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Notes (optional): Latest' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  expect(onSubmit).toHaveBeenCalledWith(
    {
      title: 'My title',
      notes: 'Server notes',
      assigneeId: null,
      dueAt: null,
    },
    { title: 'My title', notes: 'Old notes', assigneeId: null, dueDate: '', dueTime: '' },
  );
});

it('keeps edits made after a network error and reviews them against the confirmed save', async () => {
  const onDraftChange = jest.fn();
  const props: TaskEditorProps = {
    task,
    members: [],
    locale: 'en',
    t: createTranslator('en'),
    pending: false,
    error: null,
    conflict: false,
    latestTask: null,
    reviewingConflict: false,
    reviewError: false,
    onCancel: jest.fn(),
    onReviewConflict: jest.fn(),
    onRetry: jest.fn(),
    onDraftChange,
    onSubmit: jest.fn(),
  };
  const view = await render(<TaskEditor {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await view.rerender(
    <TaskEditor {...props} error={{ code: 'NETWORK', message_key: 'error.network' }} />,
  );
  await fireEvent.changeText(screen.getByDisplayValue('Old title'), 'Newer title');
  expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Newer title' }));
  expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  await view.rerender(<TaskEditor {...props} task={latest} latestTask={latest} />);
  expect(screen.getByDisplayValue('Newer title')).toBeTruthy();
  expect(screen.getByText(/Server title/)).toBeTruthy();
});
