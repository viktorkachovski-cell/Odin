import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MemberDto } from '@odin/contracts';
import { createTask, keysAffectedByTaskChange, useCommand } from '@odin/data';

import { useOdin } from '../state/OdinContext.ts';
import { useTheme } from '../theme.ts';
import { TaskEditor } from './TaskEditor.tsx';

/**
 * "New task" from Today or Tasks, where no list is open: the ordinary task
 * editor with a list choice on top. A task still belongs to exactly one active
 * list; this only lets the member pick which.
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
        {active.map((list) => {
          const selected = list.id === listId;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={list.id}
              onPress={() => setListId(list.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
                  borderRadius: theme.radius.pill,
                  minHeight: theme.touchTarget,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? theme.colors.accent : theme.colors.text },
                  selected && styles.chipSelected,
                ]}
              >
                {list.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
      pending={save.state.pending}
      t={t}
      task={null}
    />
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  chipSelected: { fontWeight: '700' },
  chipText: { fontSize: 14 },
  chips: { gap: 8 },
  field: { gap: 6 },
  label: { fontSize: 14 },
});
