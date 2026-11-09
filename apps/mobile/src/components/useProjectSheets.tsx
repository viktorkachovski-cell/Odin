import { useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import type { CommandError, ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import { useProjectActions } from '@odin/data';

import { useOdin } from '../state/OdinContext.ts';
import { useEvent } from '../state/useEvent.ts';
import { MoveToProjectSheet } from './MoveToProjectSheet.tsx';
import { ProjectEditor } from './ProjectEditor.tsx';

/**
 * Everything the Lists screen does with projects: create, rename and delete a
 * project, and move a list into or out of one. It owns the two sheets those
 * need and hands the screen their triggers, so the screen only decides where
 * the triggers go.
 */

type Editing = { readonly project: ProjectSummaryDto | null } | null;

export function useProjectSheets(projects: readonly ProjectSummaryDto[]) {
  const { t, client } = useOdin();
  const [editing, setEditing] = useState<Editing>(null);
  const [moving, setMoving] = useState<ListSummaryDto | null>(null);
  const actions = useProjectActions(client, { created: () => setEditing(null) });

  const commands = [actions.remove, actions.moveList];
  const errors: CommandError[] = commands.flatMap((command) =>
    command.state.error === null ? [] : [command.state.error],
  );

  const confirmDelete = useEvent((project: ProjectSummaryDto) =>
    Alert.alert(t('project.delete.title'), t('project.delete.confirm'), [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('project.delete'),
        style: 'destructive',
        onPress: () =>
          void actions.remove.run({ projectId: project.id, expectedVersion: project.version }),
      },
    ]),
  );

  const closeEditor = (): void => {
    actions.create.reset();
    actions.rename.reset();
    setEditing(null);
  };
  const submitEditor = (project: ProjectSummaryDto | null, name: string): void => {
    if (project === null) {
      void actions.create.run({ name });
      return;
    }
    void actions.rename
      .run({ projectId: project.id, expectedVersion: project.version, name })
      .then((result) => {
        if (result.ok) setEditing(null);
      });
  };

  const sheets: ReactNode = (
    <>
      {editing !== null && (
        <ProjectEditor
          error={editing.project === null ? actions.create.state.error : actions.rename.state.error}
          onCancel={closeEditor}
          onSubmit={(name) => submitEditor(editing.project, name)}
          pending={actions.create.state.pending || actions.rename.state.pending}
          project={editing.project}
          t={t}
        />
      )}
      {moving !== null && (
        <MoveToProjectSheet
          error={actions.moveList.state.error}
          list={moving}
          onCancel={() => {
            actions.moveList.reset();
            setMoving(null);
          }}
          onSubmit={(projectId) =>
            void actions.moveList
              .run({ listId: moving.id, expectedVersion: moving.version, projectId })
              .then((result) => {
                if (result.ok) setMoving(null);
              })
          }
          pending={actions.moveList.state.pending}
          projects={projects}
          t={t}
        />
      )}
    </>
  );

  return {
    sheets,
    errors,
    busy: commands.some((command) => command.state.pending),
    newProject: () => setEditing({ project: null }),
    renameProject: (project: ProjectSummaryDto) => setEditing({ project }),
    deleteProject: confirmDelete,
    moveList: setMoving,
  };
}
