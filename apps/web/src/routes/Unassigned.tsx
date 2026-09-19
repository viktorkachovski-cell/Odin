import type { ReactNode } from 'react';

import { claimTask, keysAffectedByTaskChange } from '@odin/data';
import { taskRowFromCrossList } from '@odin/contracts';

import { useOdin } from '../app/OdinContext.ts';
import { useMembersQuery, useUnassignedQuery } from '../app/queries.ts';
import { useCommand } from '../app/useCommand.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

/**
 * Unassigned: incomplete, unclaimed tasks across every open active list.
 * Claiming waits for server confirmation rather than optimistically assuming it
 * succeeded, because a concurrent claim legitimately loses.
 */

export function Unassigned(): ReactNode {
  const { t, locale, client } = useOdin();
  const query = useUnassignedQuery(true);
  const members = useMembersQuery(true);

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

      {tasks.length === 0 ? (
        <p className="empty">{t('unassigned.empty')}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              busy={claim.state.pending}
              key={task.task_id}
              locale={locale}
              members={members.data ?? []}
              onClaim={(selected) =>
                void claim.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                })
              }
              t={t}
              task={taskRowFromCrossList(task, null)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
