import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CommandError, ListDto } from '@odin/contracts';
import { validateSubtitle, validateTitle } from '@odin/domain';
import type { TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { errorMessage } from './Banner.tsx';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { Field } from './Field.tsx';
import { Sheet } from './Sheet.tsx';

/** Lists carry no deadline anywhere in the UI, matching the schema and DTOs. */

export interface ListEditorProps {
  readonly list: ListDto | null;
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onSubmit: (input: { readonly title: string; readonly subtitle: string | null }) => void;
}

export function ListEditor({
  list,
  t,
  pending,
  error,
  onCancel,
  onSubmit,
}: ListEditorProps): ReactNode {
  const theme = useTheme();
  const [title, setTitle] = useState(list?.title ?? '');
  const [subtitle, setSubtitle] = useState(list?.subtitle ?? '');
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [subtitleIssue, setSubtitleIssue] = useState<string | undefined>(undefined);

  const submit = (): void => {
    const titleProblem = validateTitle(title);
    const subtitleProblem = validateSubtitle(subtitle);
    setTitleIssue(
      titleProblem === null ? undefined : t(titleProblem.message_key as TranslationKey),
    );
    setSubtitleIssue(
      subtitleProblem === null ? undefined : t(subtitleProblem.message_key as TranslationKey),
    );
    if (titleProblem !== null || subtitleProblem !== null) return;

    const trimmed = subtitle.trim();
    onSubmit({ title: title.trim(), subtitle: trimmed.length === 0 ? null : trimmed });
  };

  return (
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('action.cancel')} onPress={onCancel} />
          <PrimaryButton
            label={pending ? t('state.saving') : t('list.save')}
            onPress={submit}
            pending={pending}
          />
        </>
      }
      onClose={onCancel}
      title={list === null ? t('home.create_list') : t('list.edit')}
    >
      {error !== null && (
        <View accessibilityRole="alert" style={styles.error}>
          <Text style={{ color: theme.colors.danger }}>{errorMessage(error, t)}</Text>
        </View>
      )}

      <Field
        error={titleIssue}
        label={t('list.title.label')}
        onChangeText={setTitle}
        value={title}
      />
      <Field
        error={subtitleIssue}
        label={t('list.subtitle.label')}
        onChangeText={setSubtitle}
        value={subtitle}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  error: { paddingBottom: 4 },
});
