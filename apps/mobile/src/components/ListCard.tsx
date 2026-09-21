import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';
import { Progress } from './Progress.tsx';

/**
 * A list card. Template cards carry the border the source specifies; active
 * cards do not. The copy action is a sibling control with its own target, so
 * copying a template can never also open it.
 */
export function ListCard({
  list,
  t,
  onCopy,
  copyPending = false,
  onDelete,
  deletePending = false,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onCopy?: ((list: ListSummaryDto) => void) | undefined;
  readonly copyPending?: boolean;
  readonly onDelete?: ((list: ListSummaryDto) => void) | undefined;
  readonly deletePending?: boolean;
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
      <Link
        accessibilityRole="link"
        href={{ pathname: '/list/[id]', params: { id: list.id } }}
        style={[styles.link, { minHeight: theme.touchTarget }]}
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>{list.title}</Text>
      </Link>

      {list.subtitle !== null && (
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{list.subtitle}</Text>
      )}

      {!isTemplate && <Progress completed={list.completed_tasks} t={t} total={list.total_tasks} />}

      {onCopy !== undefined && (
        <SecondaryButton
          accessibilityLabel={`${t('home.copy_template')}: ${list.title}`}
          disabled={copyPending}
          label={t('home.copy_template')}
          onPress={() => onCopy(list)}
          pending={copyPending}
        />
      )}
      {onDelete !== undefined && !isTemplate && (
        <SecondaryButton
          accessibilityLabel={t('list.delete')}
          disabled={deletePending}
          label={t('list.delete')}
          onPress={() => onDelete(list)}
          pending={deletePending}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12 },
  link: { justifyContent: 'center' },
  subtitle: { fontSize: 14 },
  title: { fontSize: 17, fontWeight: '600' },
});
