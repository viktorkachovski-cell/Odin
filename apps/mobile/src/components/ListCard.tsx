import { Link } from 'expo-router';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { SecondaryButton } from './Button.tsx';
import { Progress } from './Progress.tsx';

function SaveListTemplateIcon({
  list,
  t,
  onSaveTemplate,
  pending,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onSaveTemplate?: ((list: ListSummaryDto) => void) | undefined;
  readonly pending: boolean;
}): ReactNode {
  const theme = useTheme();
  if (onSaveTemplate === undefined || list.kind === 'template') return null;
  return (
    <Pressable
      accessibilityLabel={t('list.template.save_named', { title: list.title })}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      disabled={pending}
      hitSlop={4}
      onPress={() => onSaveTemplate(list)}
      style={[
        styles.save,
        { minHeight: theme.touchTarget, minWidth: theme.touchTarget, opacity: pending ? 0.55 : 1 },
      ]}
    >
      <Text style={[styles.saveGlyph, { color: theme.colors.accent }]}>☆</Text>
    </Pressable>
  );
}

function ListMoveControls({
  list,
  t,
  onMove,
  pending,
  moveUpDisabled,
  moveDownDisabled,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onMove?: ((list: ListSummaryDto, direction: MoveDirection) => void) | undefined;
  readonly pending: boolean;
  readonly moveUpDisabled: boolean;
  readonly moveDownDisabled: boolean;
}): ReactNode {
  const theme = useTheme();
  if (onMove === undefined) return null;
  return (
    <View style={styles.moveButtons}>
      {(['up', 'down'] as const).map((direction) => {
        // Disabled while any move is in flight: a second tap would reuse the
        // pending request id for different input, or send a stale version.
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
            style={[
              styles.moveButton,
              { minHeight: theme.touchTarget, minWidth: theme.touchTarget },
            ]}
          >
            <Text style={[styles.moveGlyph, { color: theme.colors.textMuted }]}>
              {direction === 'up' ? '↑' : '↓'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A list card. Template cards carry the border the source specifies; active
 * cards do not. The copy action is a sibling control with its own target, so
 * copying a template can never also open it. Both kinds expose Delete list;
 * only an active list can be saved as a template.
 */
export const ListCard = memo(function ListCard({
  list,
  t,
  onCopy,
  copyPending = false,
  onDelete,
  deletePending = false,
  onSaveTemplate,
  saveTemplatePending = false,
  onMove,
  movePending = false,
  moveUpDisabled = false,
  moveDownDisabled = false,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly onCopy?: ((list: ListSummaryDto) => void) | undefined;
  readonly copyPending?: boolean;
  readonly onDelete?: ((list: ListSummaryDto) => void) | undefined;
  readonly deletePending?: boolean;
  readonly onSaveTemplate?: ((list: ListSummaryDto) => void) | undefined;
  readonly saveTemplatePending?: boolean;
  readonly onMove?: ((list: ListSummaryDto, direction: MoveDirection) => void) | undefined;
  readonly movePending?: boolean;
  readonly moveUpDisabled?: boolean;
  readonly moveDownDisabled?: boolean;
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
        <View style={styles.nameRow}>
          <Link
            accessibilityRole="link"
            href={{ pathname: '/list/[id]', params: { id: list.id } }}
            style={[styles.link, { minHeight: theme.touchTarget }]}
          >
            <Text style={[styles.title, { color: theme.colors.text }]}>{list.title}</Text>
          </Link>
          <SaveListTemplateIcon
            list={list}
            onSaveTemplate={onSaveTemplate}
            pending={saveTemplatePending}
            t={t}
          />
          <ListMoveControls
            list={list}
            moveDownDisabled={moveDownDisabled}
            moveUpDisabled={moveUpDisabled}
            onMove={onMove}
            pending={movePending}
            t={t}
          />
        </View>
        {onDelete !== undefined && (
          <ActionMenu
            accessibilityLabel={`${t('list.actions')}: ${list.title}`}
            actions={[
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
});

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12 },
  header: { alignItems: 'flex-start', flexDirection: 'row' },
  nameRow: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  link: { flex: 1, justifyContent: 'center' },
  notes: { fontSize: 14 },
  subtitle: { fontSize: 14 },
  title: { fontSize: 17, fontWeight: '600' },
  moveButtons: { flexDirection: 'column' },
  moveButton: { alignItems: 'center', justifyContent: 'center' },
  moveGlyph: { fontSize: 18, fontWeight: '700' },
  save: { alignItems: 'center', justifyContent: 'center' },
  saveGlyph: { fontSize: 26, lineHeight: 30 },
});
