import { useState, type ReactNode } from 'react';

import type { CommandError, ProjectDto } from '@odin/contracts';
import { validateProjectName } from '@odin/domain';
import { issueText, type Translator } from '@odin/i18n';

import { InlineError } from './Banner.tsx';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { Field } from './Field.tsx';
import { Sheet } from './Sheet.tsx';

/** Creates a project or renames one: a project has only a name. */
export function ProjectEditor({
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
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('action.cancel')} onPress={onCancel} />
          <PrimaryButton
            label={pending ? t('state.saving') : t('project.save')}
            onPress={submit}
            pending={pending}
          />
        </>
      }
      onClose={onCancel}
      title={project === null ? t('project.create.title') : t('project.rename.title')}
    >
      <InlineError error={error} t={t} />
      <Field
        error={issue}
        label={t('project.name.label')}
        onChangeText={setName}
        onSubmitEditing={submit}
        returnKeyType="done"
        value={name}
      />
    </Sheet>
  );
}
