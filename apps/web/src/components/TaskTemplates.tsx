import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { TaskTemplateDto } from '@odin/contracts';
import {
  getTaskTemplates,
  keysAffectedByTaskTemplateChange,
  queryKeys,
  saveTaskTemplate,
  useCommand,
} from '@odin/data';
import type { Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { errorMessage } from './Banner.tsx';

export function TaskTemplates({
  draft,
  allowChoose,
  disabled,
  onChoose,
  t,
}: {
  readonly draft: { readonly title: string; readonly notes: string };
  readonly allowChoose: boolean;
  readonly disabled: boolean;
  readonly onChoose: (template: TaskTemplateDto) => void;
  readonly t: Translator;
}): ReactNode {
  const { client } = useOdin();
  const [saved, setSaved] = useState(false);
  const templates = useQuery({
    queryKey: queryKeys.taskTemplates,
    queryFn: () => getTaskTemplates(client),
    enabled: allowChoose,
  });
  const save = useCommand(
    (requestId, input: { readonly title: string; readonly notes: string }) =>
      saveTaskTemplate(client, requestId, input),
    {
      invalidate: keysAffectedByTaskTemplateChange(),
      onSuccess: () => setSaved(true),
    },
  );

  return (
    <div className="field">
      {allowChoose && (
        <label className="field__label">
          {t('task.template.choose')}
          <select
            className="field__control"
            disabled={disabled || templates.isPending}
            onChange={(event) => {
              const selected = templates.data?.items.find((item) => item.id === event.target.value);
              if (selected !== undefined) onChoose(selected);
            }}
            value=""
          >
            <option value="">{t('task.template.none')}</option>
            {templates.data?.items.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        className="button button--quiet"
        disabled={disabled || save.state.pending || draft.title.trim().length === 0}
        onClick={() => {
          setSaved(false);
          void save.run({ title: draft.title.trim(), notes: draft.notes.trim() });
        }}
        type="button"
      >
        {t('task.template.save')}
      </button>
      <span className="field__error" style={{ color: 'inherit' }}>
        {t('task.template.hint')}
      </span>
      {saved && (
        <span aria-live="polite" className="field__error" style={{ color: 'inherit' }}>
          {t('task.template.saved')}
        </span>
      )}
      {save.state.error !== null && (
        <span className="field__error" role="alert">
          {errorMessage(save.state.error, t)}
        </span>
      )}
    </div>
  );
}
