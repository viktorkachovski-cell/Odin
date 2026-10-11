import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MemberDto } from '@odin/contracts';
import { createTask, keysAffectedByTaskChange, useCommand } from '@odin/data';

import { useOdin } from '../state/OdinContext.ts';
import { useTheme } from '../theme.ts';
import { Chip } from './Blocks.tsx';
import { FloatingActionButton } from './FloatingActionButton.tsx';
import { TaskEditor } from './TaskEditor.tsx';

/**
 * "New task" from Today or Tasks, where no list is open: the floating action
 * button and the ordinary task editor with a list choice on top. A task still
 * belongs to exactly one active list; this only lets the member pick which.
 */
export function NewTaskFab({
  lists,
  members,
}: {
  readonly lists: readonly ListSummaryDto[];
  readonly members: readonly MemberDto[];
}): ReactNode {
  const { t } = useOdin();
  const [open, setOpen] = useState(false);
  if (!lists.some((list) => list.kind === 'active')) return null;
  return (
    <>
      <FloatingActionButton label={t('tasks.new')} onPress={() => setOpen(true)} />
      {open && <NewTaskEditor lists={lists} members={members} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewTaskEditor({
  lists,
  members,
  onClose,
}: {
  readonly lists: readonly ListSummaryDto[];
  readonly members: readonly MemberDto[];
  readonly onClose: () => void;
}): ReactNode {
  const { t, client } = useOdin();
  const theme = useTheme();
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
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{t('task.list.label')}</Text>
      <ScrollView contentContainerStyle={styles.chips} horizontal>
        {active.map((list) => (
          <Chip
            key={list.id}
            label={list.title}
            onPress={() => setListId(list.id)}
            role="radio"
            selected={list.id === listId}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <TaskEditor
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
      pending={save.state.pending}
      t={t}
      task={null}
    />
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 4 },
  field: { gap: 6 },
  label: { fontSize: 14 },
});
