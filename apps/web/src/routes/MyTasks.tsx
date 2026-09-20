import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { keysAffectedByTaskChange, setTaskCompleted, useCommand } from '@odin/data';
import { taskRowFromCrossList } from '@odin/contracts';

import { useOdin } from '../app/OdinContext.ts';
import { useMembersQuery, useMyTasksQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

/**
 * My Tasks: incomplete tasks assigned to the signed-in member, due ascending
 * with undated last. Completing one removes it from this view after the server
 * confirms, not before.
 */

export function MyTasks(): ReactNode {
  const { t, locale, client, user } = useOdin();
  const query = useMyTasksQuery(true);
  const members = useMembersQuery(true);

  const complete = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly completed: boolean;
      },
    ) => setTaskCompleted(client, requestId, input),
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
        <h1>{t('my_tasks.title')}</h1>
      </div>

      {complete.state.error !== null && (
        <ErrorBanner error={complete.state.error} onRetry={() => void complete.retry()} t={t} />
      )}

      {tasks.length === 0 ? (
        <p className="empty">{t('my_tasks.empty')}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              busy={complete.state.pending}
              key={task.task_id}
              locale={locale}
              members={members.data ?? []}
              onToggleCompleted={(selected, completed) =>
                void complete.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                  completed,
                })
              }
              t={t}
              task={taskRowFromCrossList(task, user?.id ?? null)}
            />
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <p className="card__subtitle">
          <Link to="/">{t('list.back')}</Link>
        </p>
      )}
    </>
  );
}
