import { useRef, useState } from 'react';

import type { ListDto } from '@odin/contracts';
import {
  createList,
  keysAffectedByListChange,
  updateList,
  useCommand,
  type OdinSupabaseClient,
} from '@odin/data';

import type { ListDraft } from '../components/ListEditor.tsx';

type ListInput = {
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
};

/** Retains newer list edits after an uncertain create or update is resolved. */
export function useListEditorCommand(client: OdinSupabaseClient, listId?: string) {
  const [editing, setEditing] = useState(false);
  const [confirmedList, setConfirmedList] = useState<ListDto | null>(null);
  const [retainedDraft, setRetainedDraft] = useState(false);
  const latestDraft = useRef<ListDraft | null>(null);
  const submittedDraft = useRef<ListDraft | null>(null);
  const editorOpen = useRef(false);
  const editorSession = useRef(0);

  const command = useCommand(
    (
      requestId,
      input: ListInput & {
        readonly listId: string | null;
        readonly editorSession: number;
        readonly expectedVersion: number;
      },
    ) =>
      input.listId === null
        ? createList(client, requestId, input)
        : updateList(client, requestId, {
            listId: input.listId,
            expectedVersion: input.expectedVersion,
            title: input.title,
            subtitle: input.subtitle,
            notes: input.notes,
          }),
    {
      invalidate: keysAffectedByListChange(listId),
      onSuccess: (savedList, input) => {
        if (!editorOpen.current || input.editorSession !== editorSession.current) return;
        if (JSON.stringify(latestDraft.current) !== JSON.stringify(submittedDraft.current)) {
          setConfirmedList(savedList);
          setRetainedDraft(true);
          return;
        }
        editorOpen.current = false;
        setEditing(false);
        setConfirmedList(null);
        setRetainedDraft(false);
      },
    },
  );

  const open = (): void => {
    if (command.state.pending) return;
    command.reset();
    editorOpen.current = true;
    editorSession.current += 1;
    latestDraft.current = null;
    submittedDraft.current = null;
    setConfirmedList(null);
    setRetainedDraft(false);
    setEditing(true);
  };

  const cancel = (): void => {
    editorOpen.current = false;
    command.reset();
    setEditing(false);
    setConfirmedList(null);
    setRetainedDraft(false);
  };

  const submit = (input: ListInput, draft: ListDraft, currentList: ListDto | null): void => {
    if (command.state.error?.code === 'NETWORK') return;
    latestDraft.current = draft;
    submittedDraft.current = draft;
    setRetainedDraft(false);
    const target = confirmedList ?? currentList;
    void command.run({
      ...input,
      listId: target?.id ?? null,
      editorSession: editorSession.current,
      expectedVersion: target?.version ?? 0,
    });
  };

  return {
    editing,
    confirmedList,
    retainedDraft,
    command,
    open,
    cancel,
    submit,
    onDraftChange: (draft: ListDraft) => {
      latestDraft.current = draft;
    },
  };
}
