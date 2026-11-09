import { useState, type ReactNode } from 'react';

import type { CommandError, ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { InlineError } from './Banner.tsx';
import { PrimaryButton, SecondaryButton } from './Button.tsx';
import { ProjectChoice } from './ProjectChoice.tsx';
import { Sheet } from './Sheet.tsx';

/** Picks the project a list belongs to, or none. The list keeps its place in the order. */
export function MoveToProjectSheet({
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
  const [choice, setChoice] = useState<string | null>(list.project_id ?? null);

  return (
    <Sheet
      footer={
        <>
          <SecondaryButton label={t('action.cancel')} onPress={onCancel} />
          <PrimaryButton
            label={pending ? t('state.saving') : t('list.project.move.save')}
            onPress={() => onSubmit(choice)}
            pending={pending}
          />
        </>
      }
      onClose={onCancel}
      title={t('list.project.move.title', { title: list.title })}
    >
      <InlineError error={error} t={t} />
      <ProjectChoice onChange={setChoice} projects={projects} t={t} value={choice} />
    </Sheet>
  );
}
