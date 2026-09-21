import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TaskTemplateDto } from '@odin/contracts';
import {
  getTaskTemplates,
  keysAffectedByTaskTemplateChange,
  queryKeys,
  saveTaskTemplate,
  useCommand,
} from '@odin/data';
import type { Translator } from '@odin/i18n';

import { useOdin } from '../state/OdinContext.ts';
import { useTheme } from '../theme.ts';
import { errorMessage } from './Banner.tsx';
import { SecondaryButton } from './Button.tsx';

export function TaskTemplates({
  draft,
  allowChoose,
  disabled,
  onChoose,
  t,
}: {
  readonly draft: { readonly title: string; readonly notes: string };
  readonly allowChoose: boolean;
  readonly disabled: boolean;
  readonly onChoose: (template: TaskTemplateDto) => void;
  readonly t: Translator;
}): ReactNode {
  const { client } = useOdin();
  const theme = useTheme();
  const [saved, setSaved] = useState(false);
  const templates = useQuery({
    queryKey: queryKeys.taskTemplates,
    queryFn: () => getTaskTemplates(client),
    enabled: allowChoose,
  });
  const save = useCommand(
    (requestId, input: { readonly title: string; readonly notes: string }) =>
      saveTaskTemplate(client, requestId, input),
    {
      invalidate: keysAffectedByTaskTemplateChange(),
      onSuccess: () => setSaved(true),
    },
  );

  return (
    <View style={styles.wrapper}>
      {allowChoose && (templates.data?.items.length ?? 0) > 0 && (
        <View style={styles.wrapper}>
          <Text style={{ color: theme.colors.textMuted }}>{t('task.template.choose')}</Text>
          <View style={styles.choices}>
            {templates.data?.items.map((template) => (
              <SecondaryButton
                key={template.id}
                label={template.title}
                onPress={() => onChoose(template)}
              />
            ))}
          </View>
        </View>
      )}
      <SecondaryButton
        disabled={disabled || save.state.pending || draft.title.trim().length === 0}
        label={t('task.template.save')}
        onPress={() => {
          setSaved(false);
          void save.run({ title: draft.title.trim(), notes: draft.notes.trim() });
        }}
      />
      <Text style={{ color: theme.colors.textMuted }}>{t('task.template.hint')}</Text>
      {saved && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>
          {t('task.template.saved')}
        </Text>
      )}
      {save.state.error !== null && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {errorMessage(save.state.error, t)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrapper: { gap: 8 },
});
