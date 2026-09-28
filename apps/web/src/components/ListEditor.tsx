import { useState, type ReactNode } from 'react';

import type { CommandError, ListDto } from '@odin/contracts';
import { normalizeText, validateNotes, validateSubtitle, validateTitle } from '@odin/domain';
import { issueText, type Translator } from '@odin/i18n';

import { ErrorBanner } from './Banner.tsx';
import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';

/**
 * Lists carry no deadline anywhere in the UI, matching the schema and DTOs.
 * The shared note sits under the subtitle, in the field order the list itself
 * is rendered in.
 */

interface ListEditorProps {
  readonly list: ListDto | null;
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onSubmit: (input: {
    readonly title: string;
    readonly subtitle: string | null;
    readonly notes: string | null;
  }) => void;
}

export function ListEditor({
  list,
  t,
  pending,
  error,
  onCancel,
  onSubmit,
}: ListEditorProps): ReactNode {
  const [title, setTitle] = useState(list?.title ?? '');
  const [subtitle, setSubtitle] = useState(list?.subtitle ?? '');
  const [notes, setNotes] = useState(list?.notes ?? '');
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [subtitleIssue, setSubtitleIssue] = useState<string | undefined>(undefined);
  const [notesIssue, setNotesIssue] = useState<string | undefined>(undefined);

  const submit = (): void => {
    const issues = [validateTitle(title), validateSubtitle(subtitle), validateNotes(notes)];
    const [titleText, subtitleText, notesText] = issues.map((issue) => issueText(issue, t));
    setTitleIssue(titleText);
    setSubtitleIssue(subtitleText);
    setNotesIssue(notesText);
    if (issues.some((issue) => issue !== null)) return;

    onSubmit({
      title: title.trim(),
      subtitle: normalizeText(subtitle),
      notes: normalizeText(notes),
    });
  };

  return (
    <Dialog
      footer={
        <>
          <button className="button" onClick={onCancel} type="button">
            {t('action.cancel')}
          </button>
          <button
            className="button button--primary"
            disabled={pending}
            onClick={submit}
            type="button"
          >
            {pending ? t('state.saving') : t('list.save')}
          </button>
        </>
      }
      onClose={onCancel}
      title={list === null ? t('home.create_list') : t('list.edit')}
    >
      {error !== null && <ErrorBanner error={error} t={t} />}

      <Field error={titleIssue} label={t('list.title.label')}>
        {(props) => (
          <input
            {...props}
            onChange={(event) => setTitle(event.target.value)}
            type="text"
            value={title}
          />
        )}
      </Field>

      <Field error={subtitleIssue} label={t('list.subtitle.label')}>
        {(props) => (
          <input
            {...props}
            onChange={(event) => setSubtitle(event.target.value)}
            type="text"
            value={subtitle}
          />
        )}
      </Field>

      <Field error={notesIssue} label={t('list.notes.label')}>
        {(props) => (
          <textarea
            {...props}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            value={notes}
          />
        )}
      </Field>
    </Dialog>
  );
}
