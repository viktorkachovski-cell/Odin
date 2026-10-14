import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TaskDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';
import { TaskEditor } from './TaskEditor.tsx';

jest.mock('./TaskTemplates.tsx', () => ({ TaskTemplates: () => null }));
const t = createTranslator('en');
const members = [{ user_id: 'u1', display_name: 'Ana', avatar_ref: null }];
const task: TaskDto = {
  id: 't1',
  household_id: 'h1',
  list_id: 'l1',
  title: 'Clean pantry',
  notes: 'Keep jars dry',
  assignee_id: 'u1',
  due_at: null,
  completed: false,
  sort_order: 1,
  version: 3,
  created_at: '2030-01-01T10:00:00Z',
  updated_at: '2030-01-01T10:00:00Z',
};
const props = {
  members,
  t,
  pending: false,
  error: null,
  onCancel: jest.fn(),
  onReviewConflict: jest.fn(),
};

describe('Task entry disclosure', () => {
  it('creates a title-only task with the established unassigned and undated defaults', async () => {
    const onSubmit = jest.fn();
    await render(<TaskEditor {...props} task={null} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText('Notes (optional)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Task title'), '  Check pantry  ');
    await fireEvent.press(screen.getByLabelText('Save task'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Check pantry',
      notes: '',
      assigneeId: null,
      dueAt: null,
    });
  });

  it('retains optional fields when collapsed and expanded, and submits them when hidden', async () => {
    const onSubmit = jest.fn();
    await render(<TaskEditor {...props} task={null} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Task title'), 'Check pantry');
    await fireEvent.press(screen.getByText(/Assignment, deadline/));
    await fireEvent.changeText(screen.getByLabelText('Notes (optional)'), 'Keep the large jars');
    await fireEvent.press(screen.getByLabelText('Ana'));
    await fireEvent.press(screen.getByText(/Assignment, deadline/));
    expect(screen.queryByLabelText('Notes (optional)')).toBeNull();
    await fireEvent.press(screen.getByText(/Assignment, deadline/));
    expect(screen.getByLabelText('Notes (optional)')).toHaveDisplayValue('Keep the large jars');
    await fireEvent.press(screen.getByText(/Assignment, deadline/));
    await fireEvent.press(screen.getByLabelText('Save task'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Check pantry',
      notes: 'Keep the large jars',
      assigneeId: 'u1',
      dueAt: null,
    });
  });

  it('expands hidden validation errors and preserves the draft after a conflict', async () => {
    const onSubmit = jest.fn();
    const view = await render(<TaskEditor {...props} task={task} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Notes (optional)'), 'a'.repeat(5001));
    await fireEvent.changeText(screen.getByLabelText('Task title'), 'Keep my changed title');
    await fireEvent.press(screen.getByText(/Assignment, deadline/));
    await fireEvent.press(screen.getByLabelText('Save task'));
    expect(screen.getByLabelText('Notes (optional)')).toHaveDisplayValue('a'.repeat(5001));
    expect(onSubmit).not.toHaveBeenCalled();
    await view.rerender(
      <TaskEditor
        {...props}
        task={task}
        onSubmit={onSubmit}
        error={{ code: 'CONFLICT', message_key: 'error.conflict' }}
      />,
    );
    expect(screen.getByLabelText('Task title')).toHaveDisplayValue('Keep my changed title');
    expect(screen.getByText('This task changed')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Review latest'));
    expect(props.onReviewConflict).toHaveBeenCalledTimes(1);
  });

  it('edits a template task as text only', async () => {
    const onSubmit = jest.fn();
    const templateTask = { ...task, assignee_id: null };
    await render(<TaskEditor {...props} task={templateTask} onSubmit={onSubmit} textOnly />);

    expect(screen.queryByLabelText('Ana')).toBeNull();
    expect(screen.queryByText(/Assignment, deadline/)).toBeNull();
    expect(screen.getByText(/Notes$/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Task title'), 'Clean the pantry shelves');
    await fireEvent.changeText(screen.getByLabelText('Notes (optional)'), 'Top shelf first');
    await fireEvent.press(screen.getByLabelText('Save task'));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Clean the pantry shelves',
      notes: 'Top shelf first',
      assigneeId: null,
      dueAt: null,
    });
  });
});
