import type { CommandResult, TaskTemplateDto, TaskTemplatePageDto } from '@odin/contracts';
import { parseTaskTemplate, parseTaskTemplatePage } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { command } from './commands.ts';
import { readRpc } from './repositories.ts';

export function getTaskTemplates(client: OdinSupabaseClient): Promise<TaskTemplatePageDto> {
  return readRpc(client, 'get_task_templates', parseTaskTemplatePage);
}

export function saveTaskTemplate(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly title: string; readonly notes?: string | null },
): Promise<CommandResult<TaskTemplateDto>> {
  return command(
    client,
    'save_task_template',
    { request_id: requestId, title: input.title, notes: input.notes ?? null },
    parseTaskTemplate,
  );
}
