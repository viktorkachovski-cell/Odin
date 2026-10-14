import { router } from 'expo-router';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu, type ActionMenuItem } from './ActionMenu.tsx';
import { MoveButtons, ProgressBar } from './Blocks.tsx';
import { AccentButton } from './Button.tsx';

/**
 * One list on the Lists screen: title,
 * subtitle, progress, and one overflow menu. A template shows how many tasks
 * it holds and offers Use template. In reorder mode the menu gives way to the
 * move controls, so the arrows are not on every row all the time.
 *
 * An active row navigates from a plain Pressable rather than `Link asChild`:
 * the Slot behind `asChild` spreads the child's style as an object, so a style
 * array arrives as `{0: …, 1: …}` in a release build and the row loses its
 * flex, collapsing the title to a few characters per line.
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
      <View style={styles.heading}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{list.title}</Text>
        {list.kind === 'active' && (
          <Text accessible={false} style={[styles.chevron, { color: theme.colors.textMuted }]}>
            ›
          </Text>
        )}
      </View>
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
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.25;

  return (
    <View style={[styles.row, stacked && styles.stacked, { borderTopColor: theme.colors.border }]}>
      {template ? (
        <View style={[styles.text, stacked && styles.fullWidth]}>
          <ListText list={list} t={t} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id } })}
          style={[styles.text, stacked && styles.fullWidth]}
        >
          <ListText list={list} t={t} />
        </Pressable>
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
  stacked: { flexWrap: 'wrap' },
  fullWidth: { flexBasis: '100%' },
  count: { fontSize: 13 },
  progress: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 8 },
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
  text: { flex: 1, gap: 4, justifyContent: 'center', minHeight: 64, minWidth: 0 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  chevron: { fontSize: 24 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
});
