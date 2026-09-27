/**
 * Wire DTOs. Field names deliberately stay snake_case so they match the SQL
 * column and RPC payload names exactly, removing a whole class of mapping
 * mistakes between the two clients.
 *
 * These mirror what `supabase/schemas/*.sql` actually returns: commands return
 * `to_jsonb(row)` of the affected record, and reads return their own projections.
 */

export const LOCALES = ['en', 'bg'] as const;
export type Locale = (typeof LOCALES)[number];

export const LIST_KINDS = ['template', 'active'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_STATUSES = ['open', 'archived'] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

/** Text limits enforced by the database's own CHECK constraints. */
export const LIMITS = {
  title: { min: 1, max: 160 },
  taskTitle: { min: 1, max: 500 },
  notes: { min: 0, max: 5000 },
  subtitle: { min: 1, max: 300 },
  displayName: { min: 1, max: 80 },
  householdName: { min: 1, max: 160 },
} as const;

export const PAGE_SIZE = 50;

/**
 * The stored task lifecycle `set_task_state` accepts. Whether an open task is
 * shown as Unassigned or To-do is derived from its assignee (see
 * `taskStatus` in @odin/domain), so it is never sent.
 */
export const TASK_STATES = ['open', 'blocked', 'done'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const MOVE_DIRECTIONS = ['up', 'down'] as const;
export type MoveDirection = (typeof MOVE_DIRECTIONS)[number];

export interface ProfileDto {
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_ref: string | null;
  readonly locale: Locale;
}

/** Household-visible identity only: never email, never another member's locale. */
export interface MemberDto {
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_ref: string | null;
}

export interface HouseholdDto {
  readonly id: string;
  readonly name: string;
  readonly seed_locale: Locale;
  readonly created_by: string;
  readonly created_at: string;
}

export interface ListDto {
  readonly sort_order?: number;
  readonly id: string;
  readonly household_id: string;
  readonly kind: ListKind;
  readonly title: string;
  readonly subtitle: string | null;
  /** Shared, optional list note. Rendered under the subtitle on both clients. */
  readonly notes: string | null;
  readonly status: ListStatus;
  readonly seed_key: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/**
 * Home card. `get_home_v2` returns both list kinds -- list templates first,
 * then active lists, each in shared household order. Task templates are a
 * separate type and never appear here; they come from `getTaskTemplates`.
 */
export interface ListSummaryDto {
  readonly sort_order?: number;
  readonly id: string;
  readonly kind: ListKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
  readonly status: ListStatus;
  readonly version: number;
  readonly total_tasks: number;
  readonly completed_tasks: number;
}

/** A single saved task. Loading one never pulls in a list template. */
export interface TaskTemplateDto {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
}

export interface TaskTemplatePageDto {
  readonly items: readonly TaskTemplateDto[];
  readonly next_cursor: string | null;
}

export interface TaskDto {
  readonly blocked?: boolean;
  readonly notes: string | null;
  readonly id: string;
  readonly household_id: string;
  readonly list_id: string;
  readonly title: string;
  readonly sort_order: number;
  readonly completed: boolean;
  readonly assignee_id: string | null;
  readonly due_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/** A task read across lists (My Tasks, Unassigned, All Tasks) carries its list title. */
export interface HouseholdTaskDto extends TaskDto {
  readonly list_title: string;
}

/** Every open list of the household, read as one snapshot. */
export interface HomeDto {
  readonly items: readonly ListSummaryDto[];
}

/** One open list and all of its tasks, incomplete first. */
export interface ListDetailDto {
  readonly list: ListDto;
  readonly total_tasks: number;
  readonly completed_tasks: number;
  readonly progress_percent: number;
  readonly tasks: readonly TaskDto[];
}

/** A complete cross-list task collection, deadline ascending with undated last. */
export interface TaskCollectionDto {
  readonly items: readonly HouseholdTaskDto[];
}

export interface InvitationDto {
  readonly invitation_id: string;
  readonly expires_at: string;
  /** Shown once, never persisted or logged. */
  readonly token: string;
}

/**
 * The row shape the task list UI renders: a list's own task, or a task read
 * across lists together with its list title.
 */
export interface TaskRowModel {
  readonly blocked?: boolean;
  readonly id: string;
  readonly title: string;
  readonly notes?: string | null | undefined;
  readonly completed: boolean;
  readonly assignee_id: string | null;
  readonly due_at: string | null;
  readonly version: number;
  readonly list_id: string;
  readonly list_title?: string | undefined;
}

export function taskRowFromTask(task: TaskDto): TaskRowModel {
  return {
    blocked: task.blocked ?? false,
    id: task.id,
    title: task.title,
    notes: task.notes,
    completed: task.completed,
    assignee_id: task.assignee_id,
    due_at: task.due_at,
    version: task.version,
    list_id: task.list_id,
  };
}

export function taskRowFromHouseholdTask(task: HouseholdTaskDto): TaskRowModel {
  return { ...taskRowFromTask(task), list_title: task.list_title };
}
