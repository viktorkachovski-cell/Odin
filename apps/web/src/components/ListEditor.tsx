import { useState, type ReactNode } from 'react';

import type { CommandError, ListDto } from '@odin/contracts';
import { validateSubtitle, validateTitle } from '@odin/domain';
import type { Translator, TranslationKey } from '@odin/i18n';

import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';
import { errorMessage } from './Banner.tsx';

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
      {error !== null && (
        <div className="banner banner--danger" role="alert">
          {errorMessage(error, t)}
        </div>
      )}

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
    </Dialog>
  );
}
