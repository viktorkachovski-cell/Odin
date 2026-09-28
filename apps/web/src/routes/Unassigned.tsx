import { useState, type ReactNode } from 'react';

import { taskRowFromHouseholdTask } from '@odin/contracts';
import { claimTask, keysAffectedByTaskChange, useCommand, useTaskRowActions } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { useMembersQuery, useUnassignedQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { CommandErrors } from '../components/ListDetailParts.tsx';
import { TaskDetailsFlow } from '../components/TaskDetailsFlow.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

/**
 * Unassigned: incomplete, unclaimed tasks across every open active list.
 * Claiming waits for server confirmation rather than optimistically assuming it
 * succeeded, because a concurrent claim legitimately loses.
 */

export function Unassigned(): ReactNode {
  const { t, locale, client } = useOdin();
  const query = useUnassignedQuery();
  const members = useMembersQuery();
  const actions = useTaskRowActions(client);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);

  const claim = useCommand(
    (requestId, input: { readonly taskId: string; readonly expectedVersion: number }) =>
      claimTask(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
  );

  if (query.isPending) return <p role="status">{t('state.loading')}</p>;
  if (query.isError) {
    return (
      <ErrorBanner
        error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
        onRetry={() => void query.refetch()}
        t={t}
      />
    );
  }

  // The server already returns due-ascending with undated last.
  const tasks = query.data.items;

  return (
    <>
      <div className="page-header">
        <h1>{t('unassigned.title')}</h1>
      </div>

      {claim.state.error !== null && (
        <ErrorBanner error={claim.state.error} onRetry={() => void query.refetch()} t={t} />
      )}
      <CommandErrors errors={actions.errors} t={t} />

      {tasks.length === 0 ? (
        <p className="empty">{t('unassigned.empty')}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              busy={claim.state.pending || actions.busy}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onClaim={(selected) =>
                void claim.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                })
              }
              onOpenDetails={(selected) => setDetailsTaskId(selected.id)}
              onSetState={actions.setState}
              t={t}
              task={taskRowFromHouseholdTask(task)}
            />
          ))}
        </ul>
      )}

      {detailsTaskId !== null && (
        <TaskDetailsFlow
          canEdit
          members={members.data ?? []}
          onClose={() => setDetailsTaskId(null)}
          taskId={detailsTaskId}
        />
      )}
    </>
  );
}
