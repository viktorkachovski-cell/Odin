import type { TaskDto } from '@odin/contracts';

import { choicesComplete, differsFromLatest, resolvedDraft } from './TaskConflictReview.tsx';
import type { TaskDraft } from './TaskEditor.tsx';

const latest: TaskDto = {
  id: 'task-1',
  household_id: 'home-1',
  list_id: 'list-1',
  title: 'Server title',
  notes: 'Server notes',
  sort_order: 1,
  completed: false,
  assignee_id: 'member-2',
  due_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  version: 2,
};

const draft: TaskDraft = {
  title: 'My title',
  notes: 'My notes',
  assigneeId: 'member-1',
  dueDate: '2026-09-25',
  dueTime: '09:00',
};

describe('task conflict resolution', () => {
  it('requires a choice for each differing field', () => {
    expect(
      ['title', 'notes', 'assigneeId', 'due'].every((field) =>
        differsFromLatest(field as 'title' | 'notes' | 'assigneeId' | 'due', draft, latest),
      ),
    ).toBe(true);
    expect(choicesComplete(draft, latest, { title: 'mine', notes: 'latest' })).toBe(false);
    expect(
      choicesComplete(draft, latest, {
        title: 'mine',
        notes: 'latest',
        assigneeId: 'latest',
        due: 'mine',
      }),
    ).toBe(true);
  });

  it('combines chosen fields without changing the typed draft', () => {
    const merged = resolvedDraft(draft, latest, {
      title: 'mine',
      notes: 'latest',
      assigneeId: 'latest',
      due: 'mine',
    });
    expect(merged).toEqual({
      title: 'My title',
      notes: 'Server notes',
      assigneeId: 'member-2',
      dueDate: '2026-09-25',
      dueTime: '09:00',
    });
    expect(draft.notes).toBe('My notes');
  });
});
