import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { SecondaryButton } from './Button.tsx';
import { Progress } from './Progress.tsx';

/**
 * A list card. Template cards carry the border the source specifies; active
 * cards do not. The copy action is a sibling control with its own target, so
 * copying a template can never also open it. Both kinds expose Delete list;
 * only an active list can be saved as a template.
 */
export function ListCard({
  list,
  t,
  onCopy,
  copyPending = false,
  onDelete,
  deletePending = false,
  onSaveTemplate,
  saveTemplatePending = false,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onCopy?: ((list: ListSummaryDto) => void) | undefined;
  readonly copyPending?: boolean;
  readonly onDelete?: ((list: ListSummaryDto) => void) | undefined;
  readonly deletePending?: boolean;
  readonly onSaveTemplate?: ((list: ListSummaryDto) => void) | undefined;
  readonly saveTemplatePending?: boolean;
}): ReactNode {
  const theme = useTheme();
  const isTemplate = list.kind === 'template';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isTemplate ? theme.colors.borderStrong : 'transparent',
          borderRadius: theme.radius.md,
          borderWidth: isTemplate ? 2 : 0,
        },
      ]}
    >
      <View style={styles.header}>
        <Link
          accessibilityRole="link"
          href={{ pathname: '/list/[id]', params: { id: list.id } }}
          style={[styles.link, { minHeight: theme.touchTarget }]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>{list.title}</Text>
        </Link>
        {onDelete !== undefined && (
          <ActionMenu
            accessibilityLabel={`${t('list.actions')}: ${list.title}`}
            actions={[
              // Saving applies to an active list only; deleting applies to
              // both, so a member can remove a template they saved.
              ...(onSaveTemplate === undefined || isTemplate
                ? []
                : [{ label: t('list.template.save'), onPress: () => onSaveTemplate(list) }]),
              {
                label: t('list.delete'),
                onPress: () => onDelete(list),
                destructive: true,
              },
            ]}
            disabled={deletePending || saveTemplatePending}
          />
        )}
      </View>

      {list.subtitle !== null && (
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{list.subtitle}</Text>
      )}

      {list.notes !== null && (
        <Text style={[styles.notes, { color: theme.colors.textMuted }]}>{list.notes}</Text>
      )}

      {!isTemplate && <Progress completed={list.completed_tasks} t={t} total={list.total_tasks} />}

      {onCopy !== undefined && (
        <SecondaryButton
          accessibilityLabel={t('home.copy_template', { title: list.title })}
          disabled={copyPending}
          label={t('home.copy_template', { title: list.title })}
          onPress={() => onCopy(list)}
          pending={copyPending}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12 },
  header: { alignItems: 'flex-start', flexDirection: 'row' },
  link: { flex: 1, justifyContent: 'center' },
  notes: { fontSize: 14 },
  subtitle: { fontSize: 14 },
  title: { fontSize: 17, fontWeight: '600' },
});
