import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { taskRowFromHouseholdTask } from '@odin/contracts';
import { useTaskRowActions } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { useMembersQuery, useMyTasksQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { CommandErrors } from '../components/ListDetailParts.tsx';
import { TaskDetailsFlow } from '../components/TaskDetailsFlow.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

/**
 * My Tasks: incomplete tasks assigned to the signed-in member, due ascending
 * with undated last. Completing one removes it from this view after the server
 * confirms, not before.
 */

export function MyTasks(): ReactNode {
  const { t, locale, client } = useOdin();
  const query = useMyTasksQuery();
  const members = useMembersQuery();
  const actions = useTaskRowActions(client);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);

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

      <CommandErrors errors={actions.errors} t={t} />

      {tasks.length === 0 ? (
        <p className="empty">{t('my_tasks.empty')}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              busy={actions.busy}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onOpenDetails={(selected) => setDetailsTaskId(selected.id)}
              onSetState={actions.setState}
              onToggleCompleted={actions.toggleCompleted}
              t={t}
              task={taskRowFromHouseholdTask(task)}
            />
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <p className="card__subtitle">
          <Link to="/">{t('list.back')}</Link>
        </p>
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
