import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { dueDraftFromIso } from '@odin/domain';
import type { TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';
import type { TaskDraft } from './TaskEditor.tsx';

export type ConflictField = 'title' | 'notes' | 'assigneeId' | 'due';
export type FieldChoice = 'mine' | 'latest';
export type ConflictChoices = Partial<Record<ConflictField, FieldChoice>>;

const fields: readonly ConflictField[] = ['title', 'notes', 'assigneeId', 'due'];

function dueValue(draft: TaskDraft): string {
  return `${draft.dueDate}|${draft.dueTime}`;
}

export function differsFromLatest(
  field: ConflictField,
  draft: TaskDraft,
  latest: TaskDto,
): boolean {
  if (field === 'title') return draft.title.trim() !== latest.title;
  if (field === 'notes') return draft.notes.trim() !== (latest.notes ?? '');
  if (field === 'assigneeId') return draft.assigneeId !== latest.assignee_id;
  return dueValue(draft) !== dueValue({ ...draft, ...dueDraftFromIso(latest.due_at) });
}

export function choicesComplete(
  draft: TaskDraft,
  latest: TaskDto,
  choices: ConflictChoices,
): boolean {
  return fields.every(
    (field) => !differsFromLatest(field, draft, latest) || choices[field] !== undefined,
  );
}

export function resolvedDraft(
  draft: TaskDraft,
  latest: TaskDto,
  choices: ConflictChoices,
): TaskDraft {
  return {
    title: choices.title === 'latest' ? latest.title : draft.title,
    notes: choices.notes === 'latest' ? (latest.notes ?? '') : draft.notes,
    assigneeId: choices.assigneeId === 'latest' ? latest.assignee_id : draft.assigneeId,
    ...(choices.due === 'latest'
      ? dueDraftFromIso(latest.due_at)
      : {
          dueDate: draft.dueDate,
          dueTime: draft.dueTime,
        }),
  };
}

function displayValue(
  field: ConflictField,
  draft: TaskDraft,
  members: readonly MemberDto[],
  t: Translator,
): string {
  if (field === 'title') return draft.title || t('conflict.empty');
  if (field === 'notes') return draft.notes || t('conflict.empty');
  if (field === 'assigneeId') {
    return (
      members.find((member) => member.user_id === draft.assigneeId)?.display_name ??
      t('task.assignee.none')
    );
  }
  return [draft.dueDate, draft.dueTime].filter(Boolean).join(' ') || t('task.due.none');
}

export function TaskConflictReview({
  draft,
  latest,
  members,
  choices,
  onChoose,
  t,
}: {
  readonly draft: TaskDraft;
  readonly latest: TaskDto;
  readonly members: readonly MemberDto[];
  readonly choices: ConflictChoices;
  readonly onChoose: (field: ConflictField, choice: FieldChoice) => void;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  const latestDraft: TaskDraft = {
    title: latest.title,
    notes: latest.notes ?? '',
    assigneeId: latest.assignee_id,
    ...dueDraftFromIso(latest.due_at),
  };
  const labels: Record<ConflictField, TranslationKey> = {
    title: 'task.title.label',
    notes: 'task.notes.label',
    assigneeId: 'task.assignee.label',
    due: 'task.due.label',
  };

  return (
    <View accessibilityRole="alert" style={[styles.panel, { borderColor: theme.colors.danger }]}>
      <Text style={[styles.heading, { color: theme.colors.text }]}>
        {t('conflict.choose_fields')}
      </Text>
      <Text style={{ color: theme.colors.textMuted }}>{t('conflict.choose_hint')}</Text>
      {fields.map((field) => {
        const differs = differsFromLatest(field, draft, latest);
        return (
          <View key={field} style={styles.field}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              {t(labels[field])}
            </Text>
            <Text style={{ color: theme.colors.text }}>
              {t('conflict.mine')}: {displayValue(field, draft, members, t)}
            </Text>
            <Text style={{ color: theme.colors.text }}>
              {t('conflict.latest')}: {displayValue(field, latestDraft, members, t)}
            </Text>
            {differs && (
              <View style={styles.actions}>
                <SecondaryButton
                  accessibilityLabel={`${t(labels[field])}: ${t('conflict.mine')}`}
                  label={`${choices[field] === 'mine' ? '✓ ' : ''}${t('conflict.mine')}`}
                  onPress={() => onChoose(field, 'mine')}
                />
                <SecondaryButton
                  accessibilityLabel={`${t(labels[field])}: ${t('conflict.latest')}`}
                  label={`${choices[field] === 'latest' ? '✓ ' : ''}${t('conflict.latest')}`}
                  onPress={() => onChoose(field, 'latest')}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 10, borderWidth: 1, gap: 12, padding: 12 },
  heading: { fontSize: 16, fontWeight: '700' },
  field: { gap: 4 },
  fieldLabel: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
