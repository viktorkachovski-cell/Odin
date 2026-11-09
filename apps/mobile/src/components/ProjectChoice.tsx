import type { ReactNode } from 'react';

import type { ProjectSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { ChoiceGroup } from './ChoiceGroup.tsx';

/** Stands in for "no project" because a choice key must be a string. */
const NONE = '__none__';

/** Picks a project, or none, from the household's projects. */
export function ProjectChoice({
  projects,
  value,
  onChange,
  t,
}: {
  readonly projects: readonly ProjectSummaryDto[];
  /** The chosen project id, or null for none. */
  readonly value: string | null;
  readonly onChange: (projectId: string | null) => void;
  readonly t: Translator;
}): ReactNode {
  return (
    <ChoiceGroup
      label={t('list.project.label')}
      onChange={(next) => onChange(next === NONE ? null : next)}
      options={[
        { key: NONE, label: t('project.none') },
        ...projects.map((project) => ({ key: project.id, label: project.name })),
      ]}
      value={value ?? NONE}
    />
  );
}
