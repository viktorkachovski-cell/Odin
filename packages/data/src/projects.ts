import type { CommandResult, ListDto, ProjectDto, ProjectsDto } from '@odin/contracts';
import { parseList, parseProject, parseProjectId, parseProjects } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { command } from './commands.ts';
import { readRpc } from './repositories.ts';

/** Every project with its open-list count, alphabetical, as one snapshot. */
export function getProjects(client: OdinSupabaseClient): Promise<ProjectsDto> {
  return readRpc(client, 'get_projects', parseProjects);
}

export function createProject(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly name: string },
): Promise<CommandResult<ProjectDto>> {
  return command(client, 'create_project', { request_id: requestId, name: input.name }, (data) =>
    parseProject(data),
  );
}

export function updateProject(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly projectId: string; readonly expectedVersion: number; readonly name: string },
): Promise<CommandResult<ProjectDto>> {
  return command(
    client,
    'update_project',
    {
      request_id: requestId,
      project_id: input.projectId,
      expected_version: input.expectedVersion,
      name: input.name,
    },
    (data) => parseProject(data),
  );
}

/** Ungroups the project's lists and removes the project; no list is deleted. */
export function deleteProject(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly projectId: string; readonly expectedVersion: number },
): Promise<CommandResult<string>> {
  return command(
    client,
    'delete_project',
    {
      request_id: requestId,
      project_id: input.projectId,
      expected_version: input.expectedVersion,
    },
    parseProjectId,
  );
}

/** Moves an active list into a project, or out of every project when `projectId` is null. */
export function setListProject(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly listId: string;
    readonly expectedVersion: number;
    readonly projectId: string | null;
  },
): Promise<CommandResult<ListDto>> {
  return command(
    client,
    'set_list_project',
    {
      request_id: requestId,
      list_id: input.listId,
      expected_version: input.expectedVersion,
      project_id: input.projectId,
    },
    (data) => parseList(data),
  );
}
