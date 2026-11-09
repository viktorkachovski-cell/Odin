import { useState, type ReactNode } from 'react';

import type { CommandError, ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { ErrorBanner } from './Banner.tsx';
import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';

/** Picks the project a list belongs to, or none. The list keeps its place in the order. */
export function MoveToProjectDialog({
  list,
  projects,
  t,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  readonly list: ListSummaryDto;
  readonly projects: readonly ProjectSummaryDto[];
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onSubmit: (projectId: string | null) => void;
}): ReactNode {
  const [choice, setChoice] = useState(list.project_id ?? '');

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
            onClick={() => onSubmit(choice === '' ? null : choice)}
            type="button"
          >
            {pending ? t('state.saving') : t('list.project.move.save')}
          </button>
        </>
      }
      onClose={onCancel}
      title={t('list.project.move.title', { title: list.title })}
    >
      {error !== null && <ErrorBanner error={error} t={t} />}
      <Field label={t('list.project.label')}>
        {(props) => (
          <select {...props} onChange={(event) => setChoice(event.target.value)} value={choice}>
            <option value="">{t('project.none')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Dialog>
  );
}
