import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CommandError, MemberDto, TaskDto } from '@odin/contracts';
import {
  dueIssueKey,
  resolveDueInput,
  taskDraft,
  validateNotes,
  validateTaskTitle,
  type TaskDraft,
} from '@odin/domain';
import { issueText, type Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { AssigneePicker } from './AssigneePicker.tsx';
import { InlineError } from './Banner.tsx';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { DueField } from './DueField.tsx';
import { Field } from './Field.tsx';
import { TaskTemplates } from './TaskTemplates.tsx';
import { Sheet } from './Sheet.tsx';

/**
 * Task editor. Drafts survive a failed save: on CONFLICT the typed text is kept
 * and the member is offered a review of the latest version. A template task is
 * edited text-only: it never carries an assignee or a deadline, which the
 * server refuses as well.
 */

interface TaskEditorProps {
  readonly task: TaskDto | null;
  readonly members: readonly MemberDto[];
  readonly t: Translator;
  readonly pending: boolean;
  /** A CONFLICT keeps the draft and offers `onReviewConflict` instead of an error. */
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onReviewConflict: () => void;
  /** The parent list choice follows the title for a new task. */
  readonly listField?: ReactNode;
  /** A quiet destructive action at the start of the footer. */
  readonly onDelete?: (() => void) | undefined;
  /** Title and notes only, for a template task. */
  readonly textOnly?: boolean;
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
  t,
  pending,
  error,
  onCancel,
  onReviewConflict,
  onSubmit,
  listField,
  onDelete,
  textOnly = false,
}: TaskEditorProps): ReactNode {
  const theme = useTheme();
  const [draft, setDraft] = useState<TaskDraft>(() => taskDraft(task));
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [notesIssue, setNotesIssue] = useState<string | undefined>(undefined);
  const [dueIssue, setDueIssue] = useState<string | undefined>(undefined);
  const [detailsOpen, setDetailsOpen] = useState(task !== null);
  const conflict = error?.code === 'CONFLICT';

  const submit = (): void => {
    const titleCheck = validateTaskTitle(draft.title);
    const notesCheck = validateNotes(draft.notes);
    const due = resolveDueInput(draft);
    setTitleIssue(issueText(titleCheck, t));
    setNotesIssue(issueText(notesCheck, t));
    setDueIssue(due.ok ? undefined : t(dueIssueKey(due.reason)));
    if (notesCheck !== null || !due.ok) setDetailsOpen(true);
    if (titleCheck !== null || notesCheck !== null || !due.ok) return;
    onSubmit({
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      assigneeId: textOnly ? null : draft.assigneeId,
      dueAt: textOnly ? null : due.dueAt,
    });
  };

  // Keep optional controls mounted so collapsing them never discards input,
  // picker state, a template request or its outcome.
  const templates = (
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
  );

  return (
    <Sheet
      footer={
        <>
          {onDelete !== undefined && (
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={onDelete}
              style={[styles.delete, { minHeight: theme.touchTarget }]}
            >
              <Text style={[styles.deleteText, { color: theme.colors.danger }]}>
                {t('task.delete.short')}
              </Text>
            </Pressable>
          )}
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

      <InlineError error={conflict ? null : error} t={t} />

      <Field
        error={titleIssue}
        label={t('task.title.label')}
        onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        value={draft.title}
      />
      {listField}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        onPress={() => setDetailsOpen((current) => !current)}
        style={[styles.disclosure, { borderColor: theme.colors.borderStrong }]}
      >
        <Text style={[styles.disclosureText, { color: theme.colors.accent }]}>
          {detailsOpen ? '▾ ' : '▸ '}
          {t(textOnly ? 'task.optional_notes' : 'task.optional_details')}
        </Text>
      </Pressable>
      <View style={[styles.details, !detailsOpen && styles.hidden]}>
        <Field
          multiline
          numberOfLines={4}
          error={notesIssue}
          label={t('task.notes.label')}
          value={draft.notes}
          onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
        />
        {!textOnly && (
          <>
            <AssigneePicker
              members={members}
              onSelect={(assigneeId) => setDraft((current) => ({ ...current, assigneeId }))}
              selected={draft.assigneeId}
              t={t}
            />
            <DueField
              draft={draft}
              error={dueIssue}
              onChange={(next) => setDraft((current) => ({ ...current, ...next }))}
              t={t}
            />
          </>
        )}
        {templates}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  conflict: { borderRadius: 10, borderWidth: 1, gap: 8, padding: 12 },
  conflictTitle: { fontSize: 16, fontWeight: '700' },
  delete: { justifyContent: 'center', marginRight: 'auto', paddingHorizontal: 8 },
  deleteText: { fontSize: 16, fontWeight: '500' },
  details: { gap: 16 },
  disclosure: {
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    padding: 12,
  },
  disclosureText: { fontSize: 14, fontWeight: '600' },
  hidden: { display: 'none' },
});
