import DateTimePicker from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dueDraftFromIso, type TaskDueDraft } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { SecondaryButton } from './Button.tsx';

/**
 * Deadline entry. Date and time are separate explicit choices, using the device
 * time zone; there is no implicit end-of-day. The chosen instant is sent as
 * ISO UTC by the shared domain rule and displayed back in local time.
 */

type Mode = 'date' | 'time' | null;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function pickerValue(draft: TaskDueDraft): Date {
  if (draft.dueDate.length === 0) return new Date();
  const [year, month, day] = draft.dueDate.split('-').map(Number);
  const [hour, minute] = (draft.dueTime.length === 0 ? '09:00' : draft.dueTime)
    .split(':')
    .map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
}

export function DueField({
  draft,
  onChange,
  error,
  locale,
  t,
}: {
  readonly draft: TaskDueDraft;
  readonly onChange: (next: TaskDueDraft) => void;
  readonly error?: string | undefined;
  readonly locale: Locale;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>(null);

  const summary =
    draft.dueDate.length === 0 && draft.dueTime.length === 0
      ? t('task.due.none')
      : `${draft.dueDate} ${draft.dueTime}`.trim();

  const timeZone = Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB').resolvedOptions()
    .timeZone;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{t('task.due.label')}</Text>
      <Text style={[styles.summary, { color: theme.colors.text }]}>{summary}</Text>
      {/* The zone is shown because a deadline is only unambiguous with it. */}
      <Text style={[styles.zone, { color: theme.colors.textMuted }]}>{timeZone}</Text>

      <View style={styles.actions}>
        <SecondaryButton label={t('task.due.date')} onPress={() => setMode('date')} />
        <SecondaryButton label={t('task.due.time')} onPress={() => setMode('time')} />
        <SecondaryButton
          label={t('task.due.clear')}
          onPress={() => onChange({ dueDate: '', dueTime: '' })}
        />
      </View>

      {error !== undefined && error.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      )}

      {mode !== null && (
        <DateTimePicker
          mode={mode}
          onChange={(event, selected) => {
            setMode(null);
            if (event.type !== 'set' || selected === undefined) return;
            onChange(
              mode === 'date'
                ? {
                    ...draft,
                    dueDate: `${String(selected.getFullYear())}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}`,
                  }
                : {
                    ...draft,
                    dueTime: `${pad(selected.getHours())}:${pad(selected.getMinutes())}`,
                  },
            );
          }}
          value={pickerValue(draft)}
        />
      )}
    </View>
  );
}

export { dueDraftFromIso };

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  summary: { fontSize: 16 },
  wrapper: { gap: 6 },
  zone: { fontSize: 12 },
});
