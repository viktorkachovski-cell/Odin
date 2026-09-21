import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CommandError, MemberDto, TaskDto } from '@odin/contracts';
import {
  dueDraftFromIso,
  resolveDueInput,
  validateTaskTitle,
  validateNotes,
  type TaskDueDraft,
} from '@odin/domain';
import type { Locale, TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { AssigneePicker } from './AssigneePicker.tsx';
import { errorMessage } from './Banner.tsx';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { DueField } from './DueField.tsx';
import { Field } from './Field.tsx';
import { TaskTemplates } from './TaskTemplates.tsx';
import { Sheet } from './Sheet.tsx';

/**
 * Task editor. Drafts survive a failed save: on CONFLICT the typed text is kept
 * and the user is offered a review of the latest version rather than having
 * their edit silently overwritten or discarded.
 */

export interface TaskDraft extends TaskDueDraft {
  readonly title: string;
  readonly notes: string;
  readonly assigneeId: string | null;
}

export function draftFromTask(task: TaskDto | null): TaskDraft {
  return {
    title: task?.title ?? '',
    notes: task?.notes ?? '',
    assigneeId: task?.assignee_id ?? null,
    ...dueDraftFromIso(task?.due_at),
  };
}

function dueIssueKey(reason: 'invalid_format' | 'nonexistent_local_time'): TranslationKey {
  return reason === 'nonexistent_local_time'
    ? 'validation.due.nonexistent_local_time'
    : 'validation.due.invalid_format';
}

export interface TaskEditorProps {
  readonly task: TaskDto | null;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly conflict: boolean;
  readonly onCancel: () => void;
  readonly onReviewConflict: () => void;
  readonly onSubmit: (input: {
    readonly title: string;
    readonly notes: string;
    readonly assigneeId: string | null;
    readonly dueAt: string | null;
  }) => void;
}

export function TaskEditor({
  task,
  members,
  locale,
  t,
  pending,
  error,
  conflict,
  onCancel,
  onReviewConflict,
  onSubmit,
}: TaskEditorProps): ReactNode {
  const theme = useTheme();
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromTask(task));
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [notesIssue, setNotesIssue] = useState<string | undefined>(undefined);
  const [dueIssue, setDueIssue] = useState<string | undefined>(undefined);

  const submit = (): void => {
    const issue = validateTaskTitle(draft.title);
    const notesError = validateNotes(draft.notes);
    const due = resolveDueInput(draft);
    setTitleIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    setNotesIssue(notesError === null ? undefined : t(notesError.message_key as TranslationKey));
    setDueIssue(due.ok ? undefined : t(dueIssueKey(due.reason)));
    if (issue !== null || notesError !== null || !due.ok) return;
    onSubmit({
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      assigneeId: draft.assigneeId,
      dueAt: due.dueAt,
    });
  };

  return (
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('task.cancel')} onPress={onCancel} />
          <PrimaryButton
            label={pending ? t('state.saving') : t('task.save')}
            onPress={submit}
            pending={pending}
          />
        </>
      }
      onClose={onCancel}
      title={task === null ? t('task.new.title') : t('task.edit.title')}
    >
      {conflict && (
        <View
          accessibilityRole="alert"
          style={[styles.conflict, { borderColor: theme.colors.danger }]}
        >
          <Text style={[styles.conflictTitle, { color: theme.colors.text }]}>
            {t('conflict.title')}
          </Text>
          <Text style={{ color: theme.colors.textMuted }}>{t('conflict.body')}</Text>
          <SecondaryButton label={t('conflict.review')} onPress={onReviewConflict} />
        </View>
      )}

      {error !== null && !conflict && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {errorMessage(error, t)}
        </Text>
      )}

      <TaskTemplates
        draft={draft}
        allowChoose={task === null}
        disabled={pending}
        onChoose={(template) =>
          setDraft({
            title: template.title,
            notes: template.notes ?? '',
            assigneeId: null,
            dueDate: '',
            dueTime: '',
          })
        }
        t={t}
      />
      <Field
        error={titleIssue}
        label={t('task.title.label')}
        onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        value={draft.title}
      />

      <Field
        multiline
        numberOfLines={4}
        error={notesIssue}
        label={t('task.notes.label')}
        value={draft.notes}
        onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
      />
      <AssigneePicker
        members={members}
        onSelect={(assigneeId) => setDraft((current) => ({ ...current, assigneeId }))}
        selected={draft.assigneeId}
        t={t}
      />

      <DueField
        draft={draft}
        error={dueIssue}
        locale={locale}
        onChange={(next) => setDraft((current) => ({ ...current, ...next }))}
        t={t}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  conflict: { borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  conflictTitle: { fontSize: 16, fontWeight: '700' },
});
