/**
 * Write side. Every command carries a caller-supplied request ID so an
 * ambiguous retry reuses it; every edit carries `expected_version`.
 *
 * Commands return the typed envelope rather than throwing, because a CONFLICT
 * or VALIDATION result is an expected outcome the UI must render while keeping
 * the user's input.
 */

import type {
  CommandResult,
  InvitationDto,
  ListDto,
  Locale,
  ProfileDto,
  TaskDto,
} from '@odin/contracts';
import {
  parseHouseholdId,
  parseInvitation,
  parseList,
  parseListId,
  parseProfile,
  parseTask,
} from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { asCommandResult, mapPostgrestError, toOdinError } from './error-mapping.ts';

export function newRequestId(): string {
  return crypto.randomUUID();
}

async function command<T>(
  client: OdinSupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => T,
): Promise<CommandResult<T>> {
  try {
    const response = await (
      client.rpc as unknown as (
        name: string,
        params?: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>
    )(fn, args);

    if (response.error !== null && response.error !== undefined) {
      return { ok: false, error: mapPostgrestError(response.error) };
    }
    return asCommandResult(response.data, parse);
  } catch (cause) {
    // NETWORK here means the outcome is unknown: retry with this same request ID.
    return { ok: false, error: toOdinError(cause).info };
  }
}

export function createHousehold(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly name: string; readonly seedLocale: Locale },
): Promise<CommandResult<string>> {
  return command(
    client,
    'create_household',
    { p_request_id: requestId, p_name: input.name, p_seed_locale: input.seedLocale },
    parseHouseholdId,
  );
}

export function updateProfile(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly displayName: string;
    readonly locale: Locale;
    readonly avatarRef?: string | null;
  },
): Promise<CommandResult<ProfileDto>> {
  return command(
    client,
    'update_profile',
    {
      p_request_id: requestId,
      p_display_name: input.displayName,
      p_locale: input.locale,
      p_avatar_ref: input.avatarRef ?? null,
    },
    parseProfile,
  );
}

export function createList(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly title: string; readonly subtitle?: string | null },
): Promise<CommandResult<ListDto>> {
  return command(
    client,
    'create_list',
    { p_request_id: requestId, p_title: input.title, p_subtitle: input.subtitle ?? null },
    (data) => parseList(data),
  );
}

export function updateList(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly listId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly subtitle?: string | null;
  },
): Promise<CommandResult<ListDto>> {
  return command(
    client,
    'update_list',
    {
      p_request_id: requestId,
      p_list_id: input.listId,
      p_expected_version: input.expectedVersion,
      p_title: input.title,
      p_subtitle: input.subtitle ?? null,
    },
    (data) => parseList(data),
  );
}

/** Copies text and order only; ownership, deadlines and completion are reset. */
export function copyTemplate(
  client: OdinSupabaseClient,
  requestId: string,
  templateId: string,
): Promise<CommandResult<string>> {
  return command(
    client,
    'copy_template',
    { p_request_id: requestId, p_template_id: templateId },
    parseListId,
  );
}

export function createTask(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly listId: string;
    readonly title: string;
    readonly assigneeId?: string | null;
    readonly dueAt?: string | null;
  },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'create_task',
    {
      p_request_id: requestId,
      p_list_id: input.listId,
      p_title: input.title,
      p_assignee_id: input.assigneeId ?? null,
      p_due_at: input.dueAt ?? null,
    },
    (data) => parseTask(data),
  );
}

export function updateTask(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly taskId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly assigneeId?: string | null;
    readonly dueAt?: string | null;
  },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'update_task',
    {
      p_request_id: requestId,
      p_task_id: input.taskId,
      p_expected_version: input.expectedVersion,
      p_title: input.title,
      p_assignee_id: input.assigneeId ?? null,
      p_due_at: input.dueAt ?? null,
    },
    (data) => parseTask(data),
  );
}

/** Explicit desired state. Never a toggle, so a retry cannot invert completion. */
export function setTaskCompleted(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly taskId: string;
    readonly expectedVersion: number;
    readonly completed: boolean;
  },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'set_task_completed',
    {
      p_request_id: requestId,
      p_task_id: input.taskId,
      p_expected_version: input.expectedVersion,
      p_completed: input.completed,
    },
    (data) => parseTask(data),
  );
}

export function claimTask(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly taskId: string; readonly expectedVersion: number },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'claim_task',
    {
      p_request_id: requestId,
      p_task_id: input.taskId,
      p_expected_version: input.expectedVersion,
    },
    (data) => parseTask(data),
  );
}

/** The raw link is returned once; never persist or log it. */
export function createInvitation(
  client: OdinSupabaseClient,
  requestId: string,
): Promise<CommandResult<InvitationDto>> {
  return command(client, 'create_invitation', { p_request_id: requestId }, parseInvitation);
}

export function redeemInvitation(
  client: OdinSupabaseClient,
  requestId: string,
  token: string,
): Promise<CommandResult<string>> {
  return command(
    client,
    'redeem_invitation',
    { p_request_id: requestId, p_token: token },
    parseHouseholdId,
  );
}

export function revokeInvitation(
  client: OdinSupabaseClient,
  requestId: string,
  invitationId: string,
): Promise<CommandResult<string>> {
  return command(
    client,
    'revoke_invitation',
    { p_request_id: requestId, p_invitation_id: invitationId },
    (data) => {
      const raw = data as { invitation_id?: unknown };
      if (typeof raw.invitation_id !== 'string') throw new Error('invitation_id');
      return raw.invitation_id;
    },
  );
}
