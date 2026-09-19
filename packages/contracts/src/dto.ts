/**
 * Wire DTOs. Field names deliberately stay snake_case so they match the SQL
 * column and RPC payload names exactly (docs/02-CONTRACT.md), removing a whole
 * class of mapping mistakes between the two clients.
 */

export const LOCALES = ['en', 'bg'] as const;
export type Locale = (typeof LOCALES)[number];

export const LIST_KINDS = ['template', 'active'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LIST_STATUSES = ['open', 'archived'] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

/** Text limits from docs/01-DECISIONS.md, counted in Unicode code points. */
export const LIMITS = {
  title: { min: 1, max: 160 },
  subtitle: { min: 1, max: 300 },
  displayName: { min: 1, max: 80 },
  householdName: { min: 1, max: 80 },
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

/** Home card: a list plus its whole-list counts. There is no deadline on a list. */
export interface ListSummaryDto {
  readonly id: string;
  readonly kind: ListKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly status: ListStatus;
  readonly seed_key: string | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly total: number;
  readonly completed: number;
}

export interface TaskDto {
  readonly id: string;
  readonly household_id: string;
  readonly list_id: string;
  readonly title: string;
  readonly sort_order: number;
  readonly completed: boolean;
  readonly assignee_id: string | null;
  readonly due_at: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/** My Tasks and Unassigned carry the parent list title for navigation. */
export interface CrossListTaskDto extends TaskDto {
  readonly list_title: string;
}

export interface HomeDto {
  readonly templates: readonly ListSummaryDto[];
  readonly active: readonly ListSummaryDto[];
}

export interface ListPageDto {
  readonly list: ListDto;
  readonly tasks: readonly TaskDto[];
  /** Counts cover the whole list, never just the loaded page. */
  readonly total: number;
  readonly completed: number;
  readonly next_cursor: string | null;
}

export interface TaskPageDto {
  readonly tasks: readonly CrossListTaskDto[];
  readonly next_cursor: string | null;
}

export interface SessionContextDto {
  readonly household: HouseholdDto | null;
  readonly profile: ProfileDto | null;
}

export interface InvitationDto {
  readonly invitation_id: string;
  readonly expires_at: string;
  /** Shown once, never persisted or logged. */
  readonly token: string;
}
