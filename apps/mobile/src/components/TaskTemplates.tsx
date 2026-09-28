import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { MenuSheet } from './ActionMenu.tsx';
import { InlineError } from './Banner.tsx';
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
  const [pickerOpen, setPickerOpen] = useState(false);
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
        <SecondaryButton
          disabled={disabled || templates.isPending}
          label={t('task.template.choose')}
          onPress={() => setPickerOpen(true)}
        />
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
      <InlineError error={save.state.error} t={t} />

      <MenuSheet
        animation="slide"
        onClose={() => setPickerOpen(false)}
        open={pickerOpen}
        style={styles.picker}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>
          {t('task.template.choose')}
        </Text>
        <ScrollView contentContainerStyle={styles.list}>
          {templates.data?.items.map((template) => (
            <Pressable
              accessibilityRole="button"
              android_ripple={{ color: theme.colors.surfaceMuted }}
              key={template.id}
              onPress={() => {
                onChoose(template);
                setPickerOpen(false);
              }}
              style={[styles.template, { borderColor: theme.colors.border }]}
            >
              <Text style={[styles.templateTitle, { color: theme.colors.text }]}>
                {template.title}
              </Text>
              {template.notes !== null && template.notes.length > 0 && (
                <Text numberOfLines={2} style={{ color: theme.colors.textMuted }}>
                  {template.notes}
                </Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
        <SecondaryButton label={t('action.cancel')} onPress={() => setPickerOpen(false)} />
      </MenuSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  picker: { gap: 12, maxHeight: '80%', padding: 16 },
  template: { borderBottomWidth: 1, gap: 4, minHeight: 56, paddingVertical: 10 },
  templateTitle: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  wrapper: { gap: 8 },
});
