import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  resolveTaskDeadlineFilter,
  TASK_DEADLINE_PRESETS,
  type TaskDeadlineFilter,
  type TaskView,
} from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { Field } from './Field.tsx';
import { Sheet } from './Sheet.tsx';

export interface TaskFilterSelection {
  readonly deadline: TaskDeadlineFilter;
  readonly blockedOnly: boolean;
  readonly showDone: boolean;
}

export const DEFAULT_TASK_FILTERS: TaskFilterSelection = {
  deadline: { preset: 'all' },
  blockedOnly: false,
  showDone: false,
};

function FilterToggle({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        value={value}
        thumbColor={value ? theme.colors.accent : theme.colors.surface}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accentSoft }}
      />
    </View>
  );
}

/** Changes are a draft until Apply. Cancel and Android Back leave results alone. */
export function TaskFilters({
  value,
  view,
  t,
  onApply,
  onClose,
}: {
  readonly value: TaskFilterSelection;
  readonly view: TaskView;
  readonly t: Translator;
  readonly onApply: (value: TaskFilterSelection) => void;
  readonly onClose: () => void;
}): ReactNode {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const changeDeadline = (deadline: TaskDeadlineFilter): void => {
    setInvalid(false);
    setDraft((current) => ({ ...current, deadline }));
  };
  const apply = (): void => {
    const valid = resolveTaskDeadlineFilter(draft.deadline).ok;
    setInvalid(!valid);
    if (valid) {
      onApply(draft);
      onClose();
    }
  };
  return (
    <Sheet
      title={t('tasks.filters')}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton label={t('action.cancel')} onPress={onClose} />
          <PrimaryButton label={t('tasks.filters.apply')} onPress={apply} />
        </>
      }
    >
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
        {t('filter.deadline.label')}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.presets}>
        {TASK_DEADLINE_PRESETS.map((preset) => {
          const selected = draft.deadline.preset === preset;
          return (
            <Pressable
              key={preset}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => changeDeadline({ ...draft.deadline, preset })}
              style={[
                styles.preset,
                {
                  borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
                  backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
                },
              ]}
            >
              <Text style={{ color: selected ? theme.colors.accent : theme.colors.text }}>
                {t(`filter.deadline.${preset}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {draft.deadline.preset === 'range' && (
        <View style={styles.dates}>
          <Field
            label={t('filter.date.from')}
            value={draft.deadline.from ?? ''}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            onChangeText={(from) => changeDeadline({ ...draft.deadline, from })}
          />
          <Field
            label={t('filter.date.to')}
            value={draft.deadline.to ?? ''}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            onChangeText={(to) => changeDeadline({ ...draft.deadline, to })}
          />
          {invalid && (
            <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
              {t('filter.date.invalid')}
            </Text>
          )}
        </View>
      )}
      <FilterToggle
        label={t('tasks.blocked_only')}
        value={draft.blockedOnly}
        onChange={(blockedOnly) => setDraft((current) => ({ ...current, blockedOnly }))}
      />
      {view === 'everyone' && (
        <FilterToggle
          label={t('tasks.show_done')}
          value={draft.showDone}
          onChange={(showDone) => setDraft((current) => ({ ...current, showDone }))}
        />
      )}
      <SecondaryButton
        label={t('tasks.filters.reset')}
        onPress={() => {
          setDraft(DEFAULT_TASK_FILTERS);
          setInvalid(false);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dates: { gap: 12 },
  heading: { fontSize: 16, fontWeight: '700' },
  preset: {
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    padding: 12,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 48,
  },
  toggleLabel: { flex: 1 },
});
