import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
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
      {save.state.error !== null && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {errorMessage(save.state.error, t)}
        </Text>
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
        transparent
        visible={pickerOpen}
      >
        <Pressable accessible={false} onPress={() => setPickerOpen(false)} style={styles.backdrop}>
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => setPickerOpen(false)}
            onStartShouldSetResponder={() => true}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
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
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  list: { gap: 8 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    gap: 12,
    maxHeight: '80%',
    padding: 16,
  },
  template: { borderBottomWidth: 1, gap: 4, minHeight: 56, paddingVertical: 10 },
  templateTitle: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  wrapper: { gap: 8 },
});
