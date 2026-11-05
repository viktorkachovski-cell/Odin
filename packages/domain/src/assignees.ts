/**
 * Who a task is assigned to. A task has zero or more distinct household
 * members; this is the one place both clients and the notification logic ask
 * the questions "is it mine", "is it unassigned" and "who has it", so the
 * rules cannot drift between them.
 */

import { MAX_TASK_ASSIGNEES, type MemberDto } from '@odin/contracts';

/** Anything carrying a task's assignment, including payloads that predate the set. */
export interface AssignedSubject {
  readonly assignee_id: string | null;
  readonly assignee_ids?: readonly string[] | undefined;
}

/**
 * The assignment set. A subject without `assignee_ids` is a payload from
 * before multiple assignees, whose single `assignee_id` is the whole set.
 */
export function taskAssigneeIds(task: AssignedSubject): readonly string[] {
  if (task.assignee_ids !== undefined) return task.assignee_ids;
  return task.assignee_id === null ? [] : [task.assignee_id];
}

export function isUnassigned(task: AssignedSubject): boolean {
  return taskAssigneeIds(task).length === 0;
}

export function isAssignedTo(task: AssignedSubject, userId: string | null | undefined): boolean {
  return userId !== null && userId !== undefined && taskAssigneeIds(task).includes(userId);
}

/** Distinct ids in ascending order: the form the server stores and hashes. */
export function canonicalAssigneeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function sameAssigneeSet(left: readonly string[], right: readonly string[]): boolean {
  const a = canonicalAssigneeIds(left);
  const b = canonicalAssigneeIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function withAssignee(ids: readonly string[], userId: string): string[] {
  return canonicalAssigneeIds([...ids, userId]);
}

export function withoutAssignee(ids: readonly string[], userId: string): string[] {
  return canonicalAssigneeIds(ids.filter((id) => id !== userId));
}

/** False once the set is full: the picker stops offering unselected members. */
export function canAddAssignee(ids: readonly string[]): boolean {
  return canonicalAssigneeIds(ids).length < MAX_TASK_ASSIGNEES;
}

/**
 * Display names in which two members never read the same: the later of two
 * equal names, in user-id order, gains " (2)", and so on. The order is by id,
 * so every device and both clients name the same person the same way.
 */
export function memberLabels(members: readonly MemberDto[]): ReadonlyMap<string, string> {
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const member of [...members].sort((a, b) => a.user_id.localeCompare(b.user_id))) {
    const count = (seen.get(member.display_name) ?? 0) + 1;
    seen.set(member.display_name, count);
    labels.set(
      member.user_id,
      count === 1 ? member.display_name : `${member.display_name} (${count})`,
    );
  }
  return labels;
}

export interface AssigneeEntry {
  readonly userId: string;
  /** The disambiguated display name; empty for a member no longer in the household. */
  readonly name: string;
  readonly isYou: boolean;
  /** Assigned but not in the active member list. */
  readonly former: boolean;
}

/**
 * The assignees in reading order: the member themself first, then the others
 * by name, then anyone who has since left the household.
 */
export function assigneeEntries(
  ids: readonly string[],
  members: readonly MemberDto[],
  currentUserId: string | null | undefined,
): readonly AssigneeEntry[] {
  const labels = memberLabels(members);
  const entries = canonicalAssigneeIds(ids).map((userId): AssigneeEntry => {
    const name = labels.get(userId);
    return {
      userId,
      name: name ?? '',
      isYou: userId === currentUserId,
      former: name === undefined,
    };
  });
  const rank = (entry: AssigneeEntry): number => (entry.isYou ? 0 : entry.former ? 2 : 1);
  return entries.sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
  );
}

/** A compact row summary: the first few assignees and how many more there are. */
export function summarizeAssignees(
  entries: readonly AssigneeEntry[],
  maxShown = 2,
): { readonly shown: readonly AssigneeEntry[]; readonly more: number } {
  const shown = entries.slice(0, maxShown);
  return { shown, more: entries.length - shown.length };
}

/**
 * Carries an editor's own assignee changes onto a newer version of the task.
 *
 * `original` is the set the editor opened with, `draft` what the member chose,
 * `latest` what the server holds now. The member's intent is the difference
 * between the first two -- who they added and who they removed -- and that is
 * applied to `latest`, so a member someone else added in the meantime is kept
 * rather than silently dropped when the draft is resubmitted.
 */
export function mergeAssigneeEdit(
  original: readonly string[],
  draft: readonly string[],
  latest: readonly string[],
): string[] {
  const before = new Set(original);
  const after = new Set(draft);
  const added = [...after].filter((id) => !before.has(id));
  const removed = new Set([...before].filter((id) => !after.has(id)));
  return canonicalAssigneeIds([...latest.filter((id) => !removed.has(id)), ...added]);
}
