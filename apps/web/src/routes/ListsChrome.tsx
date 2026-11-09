import type { ReactNode } from 'react';

import type { ListSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { ReorderToggle, Segmented } from '../components/Controls.tsx';
import { Icon } from '../components/Icon.tsx';
import { OverflowMenu } from '../components/OverflowMenu.tsx';

/** The Lists screen's title row: New list, with the household's templates behind its chevron. */
export function ListsHeader({
  templates,
  busy,
  t,
  onNewList,
  onUseTemplate,
}: {
  readonly templates: readonly ListSummaryDto[];
  readonly busy: boolean;
  readonly t: Translator;
  readonly onNewList: () => void;
  readonly onUseTemplate: (template: ListSummaryDto) => void;
}): ReactNode {
  return (
    <div className="page-header">
      <h1>{t('lists.title')}</h1>
      <div className="split-button page-header__primary">
        <button
          className="button button--primary split-button__main"
          onClick={onNewList}
          type="button"
        >
          <Icon name="plus" size={18} />
          {t('lists.new')}
        </button>
        {templates.length > 0 && (
          <OverflowMenu
            disabled={busy}
            heading={t('lists.from_template.heading')}
            items={templates.map((template) => ({
              key: template.id,
              label: template.title,
              description: t('lists.task_count', { count: template.total_tasks }),
              onSelect: () => onUseTemplate(template),
            }))}
            label={t('lists.from_template')}
            trigger={<Icon name="chevron-down" size={18} />}
            triggerClassName="button button--primary split-button__more"
          />
        )}
      </div>
    </div>
  );
}

export type ListsTab = 'active' | 'templates';

/** Active / Templates, New project (active tab only) and the reorder switch. */
export function ListsToolbar({
  tab,
  activeCount,
  templateCount,
  reorderable,
  reordering,
  busy,
  t,
  onTab,
  onNewProject,
  onToggleReorder,
}: {
  readonly tab: ListsTab;
  readonly activeCount: number;
  readonly templateCount: number;
  readonly reorderable: boolean;
  readonly reordering: boolean;
  readonly busy: boolean;
  readonly t: Translator;
  readonly onTab: (tab: ListsTab) => void;
  readonly onNewProject: () => void;
  readonly onToggleReorder: () => void;
}): ReactNode {
  return (
    <div className="toolbar">
      <Segmented
        label={t('lists.tab.label')}
        onChange={onTab}
        options={[
          { key: 'active', label: t('lists.tab.active'), count: activeCount },
          { key: 'templates', label: t('lists.tab.templates'), count: templateCount },
        ]}
        value={tab}
      />
      <div className="toolbar__group">
        {tab === 'active' && (
          <button className="button" disabled={busy} onClick={onNewProject} type="button">
            <Icon name="plus" size={18} />
            {t('project.new')}
          </button>
        )}
        {reorderable && <ReorderToggle on={reordering} onToggle={onToggleReorder} t={t} />}
      </div>
    </div>
  );
}
