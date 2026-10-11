import { Link } from 'expo-router';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu, type ActionMenuItem } from './ActionMenu.tsx';
import { ProgressBar } from './Blocks.tsx';

/**
 * One list on the Lists screen, as a compact row rather than a card: title,
 * subtitle, progress, and one overflow menu. A template shows how many tasks
 * it holds and offers Use template. In reorder mode the menu gives way to the
 * move controls, so the arrows are not on every row all the time.
 */

function MoveControls({
  list,
  t,
  onMove,
  pending,
  moveUpDisabled,
  moveDownDisabled,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onMove: (list: ListSummaryDto, direction: MoveDirection) => void;
  readonly pending: boolean;
  readonly moveUpDisabled: boolean;
  readonly moveDownDisabled: boolean;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.moves}>
      {(['up', 'down'] as const).map((direction) => {
        const disabled = pending || (direction === 'up' ? moveUpDisabled : moveDownDisabled);
        return (
          <Pressable
            accessibilityLabel={t(`list.move.${direction}`, { title: list.title })}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            hitSlop={4}
            key={direction}
            onPress={() => onMove(list, direction)}
            style={[styles.move, { minHeight: theme.touchTarget, minWidth: theme.touchTarget }]}
          >
            <Text
              style={[
                styles.moveGlyph,
                { color: disabled ? theme.colors.disabledText : theme.colors.text },
              ]}
            >
              {direction === 'up' ? '↑' : '↓'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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

function UseTemplate({
  list,
  t,
  pending,
  onCopy,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly pending: boolean;
  readonly onCopy: (list: ListSummaryDto) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={t('home.copy_template', { title: list.title })}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      disabled={pending}
      onPress={() => onCopy(list)}
      style={[
        styles.use,
        {
          borderColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          minHeight: theme.touchTarget,
          opacity: pending ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.useText, { color: theme.colors.accent }]}>
        {t('lists.use_template')}
      </Text>
    </Pressable>
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
        <UseTemplate list={list} onCopy={onCopy} pending={props.copyPending === true} t={t} />
      )}
      {reorder && onMove !== undefined ? (
        <MoveControls
          list={list}
          moveDownDisabled={props.moveDownDisabled === true}
          moveUpDisabled={props.moveUpDisabled === true}
          onMove={onMove}
          pending={props.movePending === true}
          t={t}
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
  move: { alignItems: 'center', justifyContent: 'center' },
  moveGlyph: { fontSize: 18, fontWeight: '700' },
  moves: { flexDirection: 'row' },
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
  use: { alignItems: 'center', borderWidth: 1.5, justifyContent: 'center', paddingHorizontal: 12 },
  useText: { fontSize: 14, fontWeight: '700' },
});
