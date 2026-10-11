import { useId, useState, type ReactNode } from 'react';

import type { ListSummaryDto, MemberDto } from '@odin/contracts';
import { createTask, keysAffectedByTaskChange, useCommand } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { TaskEditor } from './TaskEditor.tsx';

/**
 * "New task" from Today or Tasks, where no list is open: the ordinary task
 * editor with a List picker on top. A task still always belongs to exactly one
 * active list; this only lets the member choose which.
 */
export function NewTaskEditor({
  lists,
  members,
  onClose,
}: {
  readonly lists: readonly ListSummaryDto[];
  readonly members: readonly MemberDto[];
  readonly onClose: () => void;
}): ReactNode {
  const { t, client } = useOdin();
  const fieldId = useId();
  const active = lists.filter((list) => list.kind === 'active');
  const [listId, setListId] = useState(active[0]?.id ?? '');
  const save = useCommand(
    (
      requestId,
      input: {
        readonly listId: string;
        readonly title: string;
        readonly notes: string;
        readonly assigneeId: string | null;
        readonly dueAt: string | null;
      },
    ) => createTask(client, requestId, input),
    { invalidate: keysAffectedByTaskChange(), onSuccess: onClose },
  );

  const listField = (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {t('task.list.label')}
      </label>
      <select
        className="field__control"
        id={fieldId}
        onChange={(event) => setListId(event.target.value)}
        value={listId}
      >
        {active.map((list) => (
          <option key={list.id} value={list.id}>
            {list.title}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <TaskEditor
      conflict={false}
      error={save.state.error}
      listField={listField}
      members={members}
      onCancel={() => {
        save.reset();
        onClose();
      }}
      onReviewConflict={() => save.reset()}
      onSubmit={(input) => {
        if (listId.length > 0) void save.run({ listId, ...input });
      }}
      pending={save.state.pending || listId.length === 0}
      t={t}
      task={null}
      variant="side"
    />
  );
}
