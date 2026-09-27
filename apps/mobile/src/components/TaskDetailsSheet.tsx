import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { formatDueAt, type Locale, type Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { LoadingState } from './Screen.tsx';
import { Sheet } from './Sheet.tsx';

export function TaskDetailsLoadingSheet({
  t,
  onClose,
}: {
  readonly t: Translator;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      footer={<SecondaryButton label={t('task.details.close')} onPress={onClose} />}
      onClose={onClose}
      title={t('task.details.title')}
    >
      <LoadingState label={t('task.details.loading')} />
    </Sheet>
  );
}

export function TaskDetailsErrorSheet({
  t,
  onClose,
  onRetry,
}: {
  readonly t: Translator;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}): ReactNode {
  return (
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('task.details.close')} onPress={onClose} />
          <PrimaryButton label={t('state.retry')} onPress={onRetry} />
        </>
      }
      onClose={onClose}
      title={t('task.details.title')}
    >
      <Text>{t('task.details.error')}</Text>
    </Sheet>
  );
}

export function TaskDetailsSheet({
  task,
  members,
  locale,
  t,
  editable,
  onClose,
  onEdit,
}: {
  readonly task: TaskDto;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly editable: boolean;
  readonly onClose: () => void;
  readonly onEdit: () => void;
}): ReactNode {
  const assignee = members.find((member) => member.user_id === task.assignee_id);

  return (
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('task.details.close')} onPress={onClose} />
          {editable && <PrimaryButton label={t('task.details.edit')} onPress={onEdit} />}
        </>
      }
      onClose={onClose}
      title={task.title}
    >
      {task.notes !== null && <Detail label={t('task.details.notes')} value={task.notes} />}
      <Detail
        label={t('task.assignee.label')}
        value={assignee?.display_name ?? t('task.assignee.unassigned')}
      />
      <Detail
        label={t('task.due.label')}
        value={task.due_at === null ? t('task.due.none') : formatDueAt(task.due_at, locale, 'full')}
      />
    </Sheet>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.detail}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 16, lineHeight: 23 },
});
