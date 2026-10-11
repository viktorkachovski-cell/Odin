import { Link } from 'expo-router';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu, type ActionMenuItem } from './ActionMenu.tsx';
import { MoveButtons, ProgressBar } from './Blocks.tsx';
import { AccentButton } from './Button.tsx';

/**
 * One list on the Lists screen, as a compact row rather than a card: title,
 * subtitle, progress, and one overflow menu. A template shows how many tasks
 * it holds and offers Use template. In reorder mode the menu gives way to the
 * move controls, so the arrows are not on every row all the time.
 */

interface ListCardProps {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onMove?: ((list: ListSummaryDto, direction: MoveDirection) => void) | undefined;
  readonly onDelete?: ((list: ListSummaryDto) => void) | undefined;
  readonly onCopy?: ((list: ListSummaryDto) => void) | undefined;
  readonly onSaveTemplate?: ((list: ListSummaryDto) => void) | undefined;
  readonly reorder?: boolean;
  readonly movePending?: boolean;
  readonly copyPending?: boolean;
  readonly saveTemplatePending?: boolean;
  readonly deletePending?: boolean;
  readonly moveUpDisabled?: boolean;
  readonly moveDownDisabled?: boolean;
}

function menu({ list, t, onSaveTemplate, onDelete }: ListCardProps): ActionMenuItem[] {
  return [
    // A template is never saved as another template.
    ...(onSaveTemplate === undefined || list.kind === 'template'
      ? []
      : [{ label: t('list.template.save'), onPress: () => onSaveTemplate(list) }]),
    ...(onDelete === undefined
      ? []
      : [{ label: t('list.delete'), onPress: () => onDelete(list), destructive: true }]),
  ];
}

function ListText({ list, t }: Pick<ListCardProps, 'list' | 't'>): ReactNode {
  const theme = useTheme();
  const muted = [styles.sub, { color: theme.colors.textMuted }];
  return (
    <View style={styles.text}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{list.title}</Text>
      {list.subtitle !== null && <Text style={muted}>{list.subtitle}</Text>}
      {list.notes !== null && (
        <Text numberOfLines={2} style={muted}>
          {list.notes}
        </Text>
      )}
      {list.kind === 'template' ? (
        <Text style={muted}>{t('lists.task_count', { count: list.total_tasks })}</Text>
      ) : (
        <View style={styles.progress}>
          <ProgressBar completed={list.completed_tasks} total={list.total_tasks} />
          <Text style={[styles.count, { color: theme.colors.textMuted }]}>
            {t('lists.progress.short', {
              completed: list.completed_tasks,
              total: list.total_tasks,
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

export const ListCard = memo(function ListCard(props: ListCardProps): ReactNode {
  const { list, t, onMove, onCopy } = props;
  const theme = useTheme();
  const template = list.kind === 'template';
  const reorder = props.reorder === true;

  return (
    <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
      {template ? (
        <ListText list={list} t={t} />
      ) : (
        <Link asChild href={{ pathname: '/list/[id]', params: { id: list.id } }}>
          <Pressable accessibilityRole="link" style={styles.text}>
            <ListText list={list} t={t} />
          </Pressable>
        </Link>
      )}
      {template && onCopy !== undefined && !reorder && (
        <AccentButton
          accessibilityLabel={t('home.copy_template', { title: list.title })}
          disabled={props.copyPending === true}
          label={t('lists.use_template')}
          onPress={() => onCopy(list)}
        />
      )}
      {reorder && onMove !== undefined ? (
        <MoveButtons
          downDisabled={props.movePending === true || props.moveDownDisabled === true}
          label={(direction) => t(`list.move.${direction}`, { title: list.title })}
          onMove={(direction) => onMove(list, direction)}
          upDisabled={props.movePending === true || props.moveUpDisabled === true}
        />
      ) : (
        <ActionMenu
          accessibilityLabel={`${t('list.actions')}: ${list.title}`}
          actions={menu(props)}
          disabled={props.deletePending === true || props.saveTemplatePending === true}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  count: { fontSize: 13 },
  progress: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 4 },
  row: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 10,
  },
  sub: { fontSize: 13 },
  text: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700' },
});
