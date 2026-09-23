import { useEffect, useState, type ReactNode } from 'react';
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
import {
  choicesComplete,
  resolvedDraft,
  TaskConflictReview,
  type ConflictChoices,
  type ConflictField,
} from './TaskConflictReview.tsx';
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

function needsReviewChoice(
  draft: TaskDraft,
  latestTask: TaskDto | null,
  choices: ConflictChoices,
): boolean {
  return latestTask !== null && !choicesComplete(draft, latestTask, choices);
}

export interface TaskEditorProps {
  readonly task: TaskDto | null;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly conflict: boolean;
  readonly latestTask: TaskDto | null;
  readonly reviewingConflict: boolean;
  readonly reviewError: boolean;
  readonly onCancel: () => void;
  readonly onReviewConflict: () => void;
  readonly onRetry?: () => void;
  readonly onDraftChange?: (draft: TaskDraft) => void;
  readonly onSubmit: (
    input: {
      readonly title: string;
      readonly notes: string;
      readonly assigneeId: string | null;
      readonly dueAt: string | null;
    },
    draft: TaskDraft,
  ) => void;
}

export function TaskEditor({
  task,
  members,
  locale,
  t,
  pending,
  error,
  conflict,
  latestTask,
  reviewingConflict,
  reviewError,
  onCancel,
  onReviewConflict,
  onRetry,
  onDraftChange,
  onSubmit,
}: TaskEditorProps): ReactNode {
  const theme = useTheme();
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromTask(task));
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [notesIssue, setNotesIssue] = useState<string | undefined>(undefined);
  const [dueIssue, setDueIssue] = useState<string | undefined>(undefined);
  const [choices, setChoices] = useState<ConflictChoices>({});
  useEffect(() => setChoices({}), [latestTask]);
  const changeDraft = (next: TaskDraft): void => {
    setDraft(next);
    onDraftChange?.(next);
  };
  const clearChoice = (field: ConflictField): void => {
    setChoices((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const submit = (): void => {
    if (conflict || needsReviewChoice(draft, latestTask, choices)) return;
    const selected = latestTask === null ? draft : resolvedDraft(draft, latestTask, choices);
    const issue = validateTaskTitle(selected.title);
    const notesError = validateNotes(selected.notes);
    const due = resolveDueInput(selected);
    setTitleIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    setNotesIssue(notesError === null ? undefined : t(notesError.message_key as TranslationKey));
    setDueIssue(due.ok ? undefined : t(dueIssueKey(due.reason)));
    if (issue !== null || notesError !== null || !due.ok) return;
    onSubmit(
      {
        title: selected.title.trim(),
        notes: selected.notes.trim(),
        assigneeId: selected.assigneeId,
        dueAt: due.dueAt,
      },
      draft,
    );
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
            disabled={
              conflict || error?.code === 'NETWORK' || needsReviewChoice(draft, latestTask, choices)
            }
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
          <SecondaryButton
            label={reviewingConflict ? t('state.loading') : t('conflict.review')}
            onPress={onReviewConflict}
            pending={reviewingConflict}
          />
        </View>
      )}

      {reviewError && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {t('conflict.reload_failed')}
        </Text>
      )}

      {latestTask !== null && !conflict && (
        <TaskConflictReview
          choices={choices}
          draft={draft}
          latest={latestTask}
          members={members}
          onChoose={(field: ConflictField, choice) =>
            setChoices((current) => ({ ...current, [field]: choice }))
          }
          t={t}
        />
      )}

      {error !== null && !conflict && (
        <View accessibilityRole="alert">
          <Text style={{ color: theme.colors.danger }}>{errorMessage(error, t)}</Text>
          {error.code === 'NETWORK' && onRetry !== undefined && (
            <SecondaryButton label={t('state.retry')} onPress={onRetry} />
          )}
        </View>
      )}

      <TaskTemplates
        draft={draft}
        allowChoose={task === null}
        disabled={pending}
        onChoose={(template) =>
          changeDraft({
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
        onChangeText={(title) => {
          changeDraft({ ...draft, title });
          clearChoice('title');
        }}
        value={draft.title}
      />

      <Field
        multiline
        numberOfLines={4}
        error={notesIssue}
        label={t('task.notes.label')}
        value={draft.notes}
        onChangeText={(notes) => {
          changeDraft({ ...draft, notes });
          clearChoice('notes');
        }}
      />
      <AssigneePicker
        members={members}
        onSelect={(assigneeId) => {
          changeDraft({ ...draft, assigneeId });
          clearChoice('assigneeId');
        }}
        selected={draft.assigneeId}
        t={t}
      />

      <DueField
        draft={draft}
        error={dueIssue}
        locale={locale}
        onChange={(next) => {
          changeDraft({ ...draft, ...next });
          clearChoice('due');
        }}
        t={t}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  conflict: { borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  conflictTitle: { fontSize: 16, fontWeight: '700' },
});
