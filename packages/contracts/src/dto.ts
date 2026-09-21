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
  readonly id: string;
  readonly household_id: string;
  readonly kind: ListKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly status: ListStatus;
  readonly seed_key: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/** Home card. `get_home` returns both kinds in one paginated, id-ordered page. */
export interface ListSummaryDto {
  readonly id: string;
  readonly kind: ListKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly status: ListStatus;
  readonly version: number;
  readonly total_tasks: number;
  readonly completed_tasks: number;
}

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

/**
 * My Tasks and Unassigned return a narrower projection: these rows are always
 * incomplete by construction, and the id field is `task_id`.
 */
export interface CrossListTaskDto {
  readonly task_id: string;
  readonly list_id: string;
  readonly list_title: string;
  readonly title: string;
  readonly due_at: string | null;
  readonly has_no_due: boolean;
  readonly version: number;
}

export interface HomePageDto {
  readonly items: readonly ListSummaryDto[];
  readonly next_cursor: string | null;
}

export interface ListPageDto {
  readonly list: ListDto;
  /** Counts cover the whole list, never just the loaded page. */
  readonly total_tasks: number;
  readonly completed_tasks: number;
  readonly progress_percent: number;
  readonly tasks: readonly TaskDto[];
  readonly next_cursor: string | null;
}

export interface TaskPageDto {
  readonly items: readonly CrossListTaskDto[];
  readonly next_cursor: string | null;
}

export interface InvitationDto {
  readonly invitation_id: string;
  readonly expires_at: string;
  /** Shown once, never persisted or logged. */
  readonly token: string;
}

/**
 * A single row shape the task list UI renders, so the full `get_list` task and
 * the narrower cross-list projection can share one component.
 */
export interface TaskRowModel {
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

/**
 * Cross-list rows are incomplete by construction. `assignee_id` is supplied by
 * the caller because Unassigned rows have none and My Tasks rows are the
 * signed-in member's.
 */
export function taskRowFromCrossList(
  task: CrossListTaskDto,
  assigneeId: string | null,
): TaskRowModel {
  return {
    id: task.task_id,
    title: task.title,
    completed: false,
    assignee_id: assigneeId,
    due_at: task.due_at,
    version: task.version,
    list_id: task.list_id,
    list_title: task.list_title,
  };
}
