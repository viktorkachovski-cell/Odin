import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import type { ListSummaryDto } from '@odin/contracts';
import {
  copyTemplate,
  createList,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
} from '@odin/data';
import type { Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery } from '../app/queries.ts';
import { useCommand } from '../app/useCommand.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { Progress } from '../components/Progress.tsx';

/**
 * Home shows two clearly labelled sections. `get_home` returns both kinds in one
 * id-ordered page, so the split into Templates and Active lists happens here.
 *
 * Template cards keep their border and active list cards do not, matching the
 * source design; the copy control is a sibling of the card's link rather than a
 * button nested inside a button.
 */

function TemplateCard({
  summary,
  t,
  onCopy,
  busy,
}: {
  readonly summary: ListSummaryDto;
  readonly t: Translator;
  readonly onCopy: (id: string) => void;
  readonly busy: boolean;
}): ReactNode {
  return (
    <li className="card card--template">
      <span className="card__title">{summary.title}</span>
      {summary.subtitle !== null && <span className="card__subtitle">{summary.subtitle}</span>}
      <div className="card__actions">
        <button
          className="button button--primary"
          disabled={busy}
          onClick={() => onCopy(summary.id)}
          type="button"
        >
          {t('home.copy_template', { title: summary.title })}
        </button>
      </div>
    </li>
  );
}

function ActiveCard({
  summary,
  t,
}: {
  readonly summary: ListSummaryDto;
  readonly t: Translator;
}): ReactNode {
  return (
    <li className="card card--active">
      <Link className="card__title" to={`/lists/${summary.id}`}>
        {summary.title}
      </Link>
      {summary.subtitle !== null && <span className="card__subtitle">{summary.subtitle}</span>}
      <Progress completed={summary.completed_tasks} t={t} total={summary.total_tasks} />
    </li>
  );
}

export function Home(): ReactNode {
  const { t, client } = useOdin();
  const navigate = useNavigate();
  const home = useHomeQuery(true);
  const [creating, setCreating] = useState(false);

  const copy = useCommand(
    (requestId, input: { readonly templateId: string }) =>
      copyTemplate(client, requestId, input.templateId),
    {
      invalidate: keysAffectedByTaskChange(),
      onSuccess: (listId) => {
        void navigate(`/lists/${listId}`);
      },
    },
  );

  const create = useCommand(
    (requestId, input: { readonly title: string; readonly subtitle: string | null }) =>
      createList(client, requestId, input),
    {
      invalidate: keysAffectedByListChange(),
      onSuccess: () => setCreating(false),
    },
  );

  if (home.isPending) return <p role="status">{t('state.loading')}</p>;

  if (home.isError) {
    return (
      <ErrorBanner
        error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
        onRetry={() => void home.refetch()}
        t={t}
      />
    );
  }

  const templates = home.data.items.filter((item) => item.kind === 'template');
  const active = home.data.items.filter((item) => item.kind === 'active');

  return (
    <>
      <div className="page-header">
        <h1>{t('home.title')}</h1>
        <button className="button button--primary" onClick={() => setCreating(true)} type="button">
          {t('home.create_list')}
        </button>
      </div>

      {copy.state.error !== null && <ErrorBanner error={copy.state.error} t={t} />}

      <section aria-labelledby="templates-heading" className="section">
        <h2 className="section__heading" id="templates-heading">
          {t('home.templates.heading')}
        </h2>
        {templates.length === 0 ? (
          <p className="empty">{t('home.templates.empty')}</p>
        ) : (
          <ul className="card-grid">
            {templates.map((summary) => (
              <TemplateCard
                busy={copy.state.pending}
                key={summary.id}
                onCopy={(templateId) => void copy.run({ templateId })}
                summary={summary}
                t={t}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="active-heading" className="section">
        <h2 className="section__heading" id="active-heading">
          {t('home.active.heading')}
        </h2>
        {active.length === 0 ? (
          <p className="empty">{t('home.active.empty')}</p>
        ) : (
          <ul className="card-grid">
            {active.map((summary) => (
              <ActiveCard key={summary.id} summary={summary} t={t} />
            ))}
          </ul>
        )}
      </section>

      {creating && (
        <ListEditor
          error={create.state.error}
          list={null}
          onCancel={() => {
            create.reset();
            setCreating(false);
          }}
          onSubmit={(input) => void create.run(input)}
          pending={create.state.pending}
          t={t}
        />
      )}
    </>
  );
}
