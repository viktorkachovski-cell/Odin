import { useState, type ReactNode } from 'react';

import type { CommandError, ProjectDto } from '@odin/contracts';
import { validateProjectName } from '@odin/domain';
import { issueText, type Translator } from '@odin/i18n';

import { ErrorBanner } from './Banner.tsx';
import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';

/** Creates a project or renames one: a project has only a name. */
export function ProjectDialog({
  project,
  t,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  readonly project: ProjectDto | null;
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onSubmit: (name: string) => void;
}): ReactNode {
  const [name, setName] = useState(project?.name ?? '');
  const [issue, setIssue] = useState<string | undefined>(undefined);

  const submit = (): void => {
    const found = validateProjectName(name);
    setIssue(issueText(found, t));
    if (found === null) onSubmit(name.trim());
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
            {pending ? t('state.saving') : t('project.save')}
          </button>
        </>
      }
      onClose={onCancel}
      title={project === null ? t('project.create.title') : t('project.rename.title')}
    >
      {error !== null && <ErrorBanner error={error} t={t} />}
      <Field error={issue} label={t('project.name.label')}>
        {(props) => (
          <input
            {...props}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            type="text"
            value={name}
          />
        )}
      </Field>
    </Dialog>
  );
}
