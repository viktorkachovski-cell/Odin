/**
 * Runtime narrowing for RPC payloads. The server is the trust boundary, but an
 * unexpected shape must surface as a typed error rather than propagating
 * `unknown` into the UI. No external schema library: contracts stays
 * dependency-free so both clients can consume it unchanged.
 */

import type {
  CrossListTaskDto,
  HomePageDto,
  HouseholdDto,
  InvitationDto,
  ListDto,
  ListKind,
  ListPageDto,
  ListStatus,
  ListSummaryDto,
  Locale,
  MemberDto,
  ProfileDto,
  TaskDto,
  TaskPageDto,
} from './dto.ts';
import { LIST_KINDS, LIST_STATUSES, LOCALES } from './dto.ts';

export class ShapeError extends Error {
  constructor(field: string) {
    super(`Unexpected response shape at ${field}`);
    this.name = 'ShapeError';
  }
}

type Rec = Record<string, unknown>;

function obj(value: unknown, field: string): Rec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ShapeError(field);
  }
  return value as Rec;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError(field);
  return value;
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ShapeError(field);
  return value;
}

function nullableStr(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return str(value, field);
}

function num(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ShapeError(field);
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ShapeError(field);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const text = str(value, field);
  const match = allowed.find((candidate) => candidate === text);
  if (match === undefined) throw new ShapeError(field);
  return match;
}

export function parseLocale(value: unknown, field = 'locale'): Locale {
  return oneOf<Locale>(value, LOCALES, field);
}

function parseListKind(value: unknown, field: string): ListKind {
  return oneOf<ListKind>(value, LIST_KINDS, field);
}

function parseListStatus(value: unknown, field: string): ListStatus {
  return oneOf<ListStatus>(value, LIST_STATUSES, field);
}

export function parseProfile(value: unknown): ProfileDto {
  const raw = obj(value, 'profile');
  return {
    user_id: str(raw['user_id'], 'profile.user_id'),
    display_name: str(raw['display_name'], 'profile.display_name'),
    avatar_ref: nullableStr(raw['avatar_ref'], 'profile.avatar_ref'),
    locale: parseLocale(raw['locale'], 'profile.locale'),
  };
}

export function parseMembers(value: unknown): MemberDto[] {
  return arr(value, 'members').map((entry, index) => {
    const raw = obj(entry, `members[${index}]`);
    return {
      user_id: str(raw['user_id'], `members[${index}].user_id`),
      display_name: str(raw['display_name'], `members[${index}].display_name`),
      avatar_ref: nullableStr(raw['avatar_ref'], `members[${index}].avatar_ref`),
    };
  });
}

export function parseHousehold(value: unknown): HouseholdDto {
  const raw = obj(value, 'household');
  return {
    id: str(raw['id'], 'household.id'),
    name: str(raw['name'], 'household.name'),
    seed_locale: parseLocale(raw['seed_locale'], 'household.seed_locale'),
    created_by: str(raw['created_by'], 'household.created_by'),
    created_at: str(raw['created_at'], 'household.created_at'),
  };
}

export function parseList(value: unknown, field = 'list'): ListDto {
  const raw = obj(value, field);
  return {
    id: str(raw['id'], `${field}.id`),
    household_id: str(raw['household_id'], `${field}.household_id`),
    kind: parseListKind(raw['kind'], `${field}.kind`),
    title: str(raw['title'], `${field}.title`),
    subtitle: nullableStr(raw['subtitle'], `${field}.subtitle`),
    status: parseListStatus(raw['status'], `${field}.status`),
    seed_key: nullableStr(raw['seed_key'], `${field}.seed_key`),
    created_by: str(raw['created_by'], `${field}.created_by`),
    created_at: str(raw['created_at'], `${field}.created_at`),
    updated_at: str(raw['updated_at'], `${field}.updated_at`),
    version: num(raw['version'], `${field}.version`),
  };
}

function parseListSummary(value: unknown, field: string): ListSummaryDto {
  const raw = obj(value, field);
  return {
    id: str(raw['id'], `${field}.id`),
    kind: parseListKind(raw['kind'], `${field}.kind`),
    title: str(raw['title'], `${field}.title`),
    subtitle: nullableStr(raw['subtitle'], `${field}.subtitle`),
    status: parseListStatus(raw['status'], `${field}.status`),
    version: num(raw['version'], `${field}.version`),
    total_tasks: num(raw['total_tasks'], `${field}.total_tasks`),
    completed_tasks: num(raw['completed_tasks'], `${field}.completed_tasks`),
  };
}

export function parseHomePage(value: unknown): HomePageDto {
  const raw = obj(value, 'home');
  return {
    items: arr(raw['items'], 'home.items').map((entry, index) =>
      parseListSummary(entry, `home.items[${index}]`),
    ),
    next_cursor: nullableStr(raw['next_cursor'], 'home.next_cursor'),
  };
}

export function parseTask(value: unknown, field = 'task'): TaskDto {
  const raw = obj(value, field);
  return {
    id: str(raw['id'], `${field}.id`),
    household_id: str(raw['household_id'], `${field}.household_id`),
    list_id: str(raw['list_id'], `${field}.list_id`),
    title: str(raw['title'], `${field}.title`),
    sort_order: num(raw['sort_order'], `${field}.sort_order`),
    completed: bool(raw['completed'], `${field}.completed`),
    assignee_id: nullableStr(raw['assignee_id'], `${field}.assignee_id`),
    due_at: nullableStr(raw['due_at'], `${field}.due_at`),
    created_at: str(raw['created_at'], `${field}.created_at`),
    updated_at: str(raw['updated_at'], `${field}.updated_at`),
    version: num(raw['version'], `${field}.version`),
  };
}

function parseCrossListTask(value: unknown, field: string): CrossListTaskDto {
  const raw = obj(value, field);
  return {
    task_id: str(raw['task_id'], `${field}.task_id`),
    list_id: str(raw['list_id'], `${field}.list_id`),
    list_title: str(raw['list_title'], `${field}.list_title`),
    title: str(raw['title'], `${field}.title`),
    due_at: nullableStr(raw['due_at'], `${field}.due_at`),
    has_no_due: bool(raw['has_no_due'], `${field}.has_no_due`),
    version: num(raw['version'], `${field}.version`),
  };
}

export function parseListPage(value: unknown): ListPageDto {
  const raw = obj(value, 'listPage');
  return {
    list: parseList(raw['list']),
    total_tasks: num(raw['total_tasks'], 'listPage.total_tasks'),
    completed_tasks: num(raw['completed_tasks'], 'listPage.completed_tasks'),
    progress_percent: num(raw['progress_percent'], 'listPage.progress_percent'),
    tasks: arr(raw['tasks'], 'listPage.tasks').map((entry, index) =>
      parseTask(entry, `listPage.tasks[${index}]`),
    ),
    next_cursor: nullableStr(raw['next_cursor'], 'listPage.next_cursor'),
  };
}

export function parseTaskPage(value: unknown): TaskPageDto {
  const raw = obj(value, 'taskPage');
  return {
    items: arr(raw['items'], 'taskPage.items').map((entry, index) =>
      parseCrossListTask(entry, `taskPage.items[${index}]`),
    ),
    next_cursor: nullableStr(raw['next_cursor'], 'taskPage.next_cursor'),
  };
}

export function parseInvitation(value: unknown): InvitationDto {
  const raw = obj(value, 'invitation');
  return {
    invitation_id: str(raw['invitation_id'], 'invitation.invitation_id'),
    expires_at: str(raw['expires_at'], 'invitation.expires_at'),
    token: str(raw['token'], 'invitation.token'),
  };
}

export function parseHouseholdId(value: unknown): string {
  return str(obj(value, 'result')['household_id'], 'result.household_id');
}

export function parseListId(value: unknown): string {
  return str(obj(value, 'result')['list_id'], 'result.list_id');
}

export function parseTaskId(value: unknown): string {
  return str(obj(value, 'result')['task_id'], 'result.task_id');
}

export function parseInvitationId(value: unknown): string {
  return str(obj(value, 'result')['invitation_id'], 'result.invitation_id');
}
