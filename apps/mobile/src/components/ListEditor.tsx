import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CommandError, ListDto } from '@odin/contracts';
import { validateNotes, validateSubtitle, validateTitle } from '@odin/domain';
import type { TranslationKey, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { errorMessage } from './Banner.tsx';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { Field } from './Field.tsx';
import { Sheet } from './Sheet.tsx';

/**
 * Lists carry no deadline anywhere in the UI, matching the schema and DTOs.
 * The shared note sits under the subtitle, in the field order the list itself
 * is rendered in.
 */

export interface ListEditorProps {
  readonly list: ListDto | null;
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onRetry?: () => void;
  readonly onDraftChange?: (draft: ListDraft) => void;
  readonly retainedDraft?: boolean;
  readonly onSubmit: (
    input: {
      readonly title: string;
      readonly subtitle: string | null;
      readonly notes: string | null;
    },
    draft: ListDraft,
  ) => void;
}

export interface ListDraft {
  readonly title: string;
  readonly subtitle: string;
  readonly notes: string;
}

export function ListEditor({
  list,
  t,
  pending,
  error,
  onCancel,
  onRetry,
  onDraftChange,
  retainedDraft = false,
  onSubmit,
}: ListEditorProps): ReactNode {
  const theme = useTheme();
  const [title, setTitle] = useState(list?.title ?? '');
  const [subtitle, setSubtitle] = useState(list?.subtitle ?? '');
  const [notes, setNotes] = useState(list?.notes ?? '');
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [subtitleIssue, setSubtitleIssue] = useState<string | undefined>(undefined);
  const [notesIssue, setNotesIssue] = useState<string | undefined>(undefined);
  const draft = { title, subtitle, notes };
  const changeDraft = (next: ListDraft): void => {
    setTitle(next.title);
    setSubtitle(next.subtitle);
    setNotes(next.notes);
    onDraftChange?.(next);
  };

  const submit = (): void => {
    const titleProblem = validateTitle(title);
    const subtitleProblem = validateSubtitle(subtitle);
    const notesProblem = validateNotes(notes);
    setTitleIssue(
      titleProblem === null ? undefined : t(titleProblem.message_key as TranslationKey),
    );
    setSubtitleIssue(
      subtitleProblem === null ? undefined : t(subtitleProblem.message_key as TranslationKey),
    );
    setNotesIssue(
      notesProblem === null ? undefined : t(notesProblem.message_key as TranslationKey),
    );
    if (titleProblem !== null || subtitleProblem !== null || notesProblem !== null) return;

    const trimmedSubtitle = subtitle.trim();
    const trimmedNotes = notes.trim();
    onSubmit(
      {
        title: title.trim(),
        subtitle: trimmedSubtitle.length === 0 ? null : trimmedSubtitle,
        notes: trimmedNotes.length === 0 ? null : trimmedNotes,
      },
      draft,
    );
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
            disabled={error?.code === 'NETWORK'}
          />
        </>
      }
      onClose={onCancel}
      title={list === null ? t('home.create_list') : t('list.edit')}
    >
      {error !== null && (
        <View accessibilityRole="alert" style={styles.error}>
          <Text style={{ color: theme.colors.danger }}>{errorMessage(error, t)}</Text>
          {error.code === 'NETWORK' && onRetry !== undefined && (
            <SecondaryButton label={t('state.retry')} onPress={onRetry} />
          )}
        </View>
      )}

      {retainedDraft && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.text }}>
          {t('list.retry_saved_newer_draft')}
        </Text>
      )}

      <Field
        error={titleIssue}
        label={t('list.title.label')}
        onChangeText={(value) => changeDraft({ ...draft, title: value })}
        value={title}
      />
      <Field
        error={subtitleIssue}
        label={t('list.subtitle.label')}
        onChangeText={(value) => changeDraft({ ...draft, subtitle: value })}
        value={subtitle}
      />
      <Field
        error={notesIssue}
        label={t('list.notes.label')}
        multiline
        numberOfLines={4}
        onChangeText={(value) => changeDraft({ ...draft, notes: value })}
        value={notes}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  error: { paddingBottom: 4 },
});
