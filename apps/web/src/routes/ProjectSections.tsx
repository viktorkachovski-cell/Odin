import type { ReactNode } from 'react';

import type { ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import { groupListsByProject, type ProjectGrouping } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { Icon } from '../components/Icon.tsx';
import { OverflowMenu } from '../components/OverflowMenu.tsx';

/**
 * The Lists screen once the household has a project: one section per project,
 * empty ones included, then the lists that are in no project. A project is
 * only a heading over its lists, so the rows are the same rows a flat list
 * uses; the caller renders them for each group.
 */

export function ListTableHeader({ t }: { readonly t: Translator }): ReactNode {
  return (
    <div aria-hidden="true" className="list-table__header">
      <span>{t('lists.column.list')}</span>
      <span>{t('lists.column.progress')}</span>
      <span>{t('lists.column.open')}</span>
      <span />
    </div>
  );
}

function Rows({
  lists,
  renderRows,
  t,
}: {
  readonly lists: readonly ListSummaryDto[];
  readonly renderRows: (lists: readonly ListSummaryDto[]) => ReactNode;
  readonly t: Translator;
}): ReactNode {
  return (
    <div className="surface">
      <ListTableHeader t={t} />
      <ul className="list-table">{renderRows(lists)}</ul>
    </div>
  );
}

export function ProjectSections({
  grouping,
  renderRows,
  busy,
  t,
  onAddList,
  onRename,
  onDelete,
}: {
  readonly grouping: ProjectGrouping<ListSummaryDto, ProjectSummaryDto>;
  readonly renderRows: (lists: readonly ListSummaryDto[]) => ReactNode;
  readonly busy: boolean;
  readonly t: Translator;
  readonly onAddList: (project: ProjectSummaryDto) => void;
  readonly onRename: (project: ProjectSummaryDto) => void;
  readonly onDelete: (project: ProjectSummaryDto) => void;
}): ReactNode {
  return (
    <>
      {grouping.groups.map(({ project, lists }) => (
        <section aria-label={project.name} className="project" key={project.id}>
          <div className="project__header">
            <h2 className="project__name">{project.name}</h2>
            <span className="project__count">
              {t('project.list_count', { count: lists.length })}
            </span>
            <span className="project__actions">
              <button
                aria-label={t('project.add_list', { name: project.name })}
                className="button"
                disabled={busy}
                onClick={() => onAddList(project)}
                type="button"
              >
                <Icon name="plus" size={18} />
              </button>
              <OverflowMenu
                disabled={busy}
                items={[
                  {
                    key: `rename-${project.id}`,
                    label: t('project.rename'),
                    onSelect: () => onRename(project),
                  },
                  {
                    key: `delete-${project.id}`,
                    label: t('project.delete'),
                    danger: true,
                    onSelect: () => onDelete(project),
                  },
                ]}
                label={`${t('project.actions')}: ${project.name}`}
              />
            </span>
          </div>
          {lists.length === 0 ? (
            <p className="empty project__empty">{t('project.empty')}</p>
          ) : (
            <Rows lists={lists} renderRows={renderRows} t={t} />
          )}
        </section>
      ))}
      {grouping.ungrouped.length > 0 && (
        <section aria-label={t('project.other_lists')} className="project">
          <div className="project__header">
            <h2 className="project__name project__name--quiet">{t('project.other_lists')}</h2>
            <span className="project__count">
              {t('project.list_count', { count: grouping.ungrouped.length })}
            </span>
          </div>
          <Rows lists={grouping.ungrouped} renderRows={renderRows} t={t} />
        </section>
      )}
    </>
  );
}

/**
 * What sits under the Lists toolbar: project sections once the household has a
 * project (Active tab only), otherwise the flat table, or the empty message.
 */
export function ListsBody({
  tab,
  active,
  shown,
  projects,
  renderRows,
  busy,
  t,
  onAddList,
  onRename,
  onDelete,
}: {
  readonly tab: 'active' | 'templates';
  readonly active: readonly ListSummaryDto[];
  readonly shown: readonly ListSummaryDto[];
  readonly projects: readonly ProjectSummaryDto[];
  readonly renderRows: (lists: readonly ListSummaryDto[]) => ReactNode;
  readonly busy: boolean;
  readonly t: Translator;
  readonly onAddList: (project: ProjectSummaryDto) => void;
  readonly onRename: (project: ProjectSummaryDto) => void;
  readonly onDelete: (project: ProjectSummaryDto) => void;
}): ReactNode {
  if (tab === 'active' && projects.length > 0) {
    return (
      <ProjectSections
        busy={busy}
        grouping={groupListsByProject(active, projects)}
        onAddList={onAddList}
        onDelete={onDelete}
        onRename={onRename}
        renderRows={renderRows}
        t={t}
      />
    );
  }
  if (shown.length === 0) {
    return (
      <p className="empty">
        {tab === 'templates' ? t('lists.templates.empty') : t('home.active.empty')}
      </p>
    );
  }
  return (
    <div className="surface">
      {tab === 'active' && <ListTableHeader t={t} />}
      <ul className="list-table">{renderRows(shown)}</ul>
    </div>
  );
}
