import { useId, type ReactNode } from 'react';

import { MAX_TASK_ASSIGNEES, type MemberDto } from '@odin/contracts';
import {
  assigneeEntries,
  canonicalAssigneeIds,
  memberLabels,
  withAssignee,
  withoutAssignee,
} from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { Avatar } from './Avatar.tsx';

/**
 * Who a task is assigned to, as a set. Every active member is a real
 * checkbox, so keyboard and screen-reader behaviour is the browser's own:
 * Tab to move, Space to toggle, and the state is announced with the name.
 * Above the list sit the selected names in full, the member's own shortcuts
 * (Assign to me, Remove me) and Clear all.
 *
 * The component only edits a draft. Nothing is sent until the editor saves, so
 * the whole set is replaced in one command under the editor's version.
 */
export function AssigneePicker({
  members,
  selected,
  currentUserId,
  onChange,
  t,
}: {
  readonly members: readonly MemberDto[];
  readonly selected: readonly string[];
  readonly currentUserId: string | null;
  readonly onChange: (ids: readonly string[]) => void;
  readonly t: Translator;
}): ReactNode {
  const statusId = useId();
  const labels = memberLabels(members);
  const chosen = canonicalAssigneeIds(selected);
  const full = chosen.length >= MAX_TASK_ASSIGNEES;
  const mine = currentUserId !== null && chosen.includes(currentUserId);
  const canAssignMe =
    currentUserId !== null && !mine && members.some((m) => m.user_id === currentUserId);

  const summary = assigneeEntries(chosen, members, currentUserId)
    .map((entry) =>
      entry.former
        ? t('task.assignee.former')
        : entry.isYou
          ? t('task.assignee.name_you', { name: entry.name })
          : entry.name,
    )
    .join(', ');
  const toggle = (userId: string, on: boolean): void =>
    onChange(on ? withAssignee(chosen, userId) : withoutAssignee(chosen, userId));

  return (
    <fieldset aria-describedby={statusId} className="assignees">
      <legend className="field__label">{t('task.assignee.label')}</legend>
      <p className="assignees__summary" data-testid="assignee-summary">
        {chosen.length === 0 ? t('task.assignee.none') : summary}
      </p>
      <p aria-live="polite" className="visually-hidden" id={statusId}>
        {t('task.assignee.selected', { count: chosen.length })}
      </p>
      <div className="assignees__shortcuts">
        {canAssignMe && currentUserId !== null && (
          <button
            className="button button--compact"
            disabled={full}
            onClick={() => toggle(currentUserId, true)}
            type="button"
          >
            {t('task.assignee.assign_me')}
          </button>
        )}
        {mine && currentUserId !== null && (
          <button
            className="button button--compact"
            onClick={() => toggle(currentUserId, false)}
            type="button"
          >
            {t('task.assignee.remove_me')}
          </button>
        )}
        {chosen.length > 0 && (
          <button className="button button--compact" onClick={() => onChange([])} type="button">
            {t('task.assignee.clear')}
          </button>
        )}
      </div>
      <ul className="assignees__list">
        {chosen
          .filter((userId) => !members.some((member) => member.user_id === userId))
          .map((userId) => (
            // Someone assigned who has since left: shown so the member can
            // take them off, which the server requires before it saves.
            <li key={userId}>
              <label className="assignee-option">
                <input checked onChange={() => toggle(userId, false)} type="checkbox" />
                <span className="assignee-option__name">{t('task.assignee.former')}</span>
              </label>
            </li>
          ))}
        {members.map((member) => {
          const checked = chosen.includes(member.user_id);
          const name = labels.get(member.user_id) ?? member.display_name;
          const shown =
            member.user_id === currentUserId ? t('task.assignee.name_you', { name }) : name;
          return (
            <li key={member.user_id}>
              <label className="assignee-option">
                <input
                  checked={checked}
                  disabled={full && !checked}
                  onChange={(event) => toggle(member.user_id, event.target.checked)}
                  type="checkbox"
                />
                <Avatar
                  displayName={member.display_name}
                  members={members}
                  userId={member.user_id}
                />
                <span className="assignee-option__name">{shown}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {full && (
        <p className="field__error">{t('task.assignee.limit', { count: MAX_TASK_ASSIGNEES })}</p>
      )}
    </fieldset>
  );
}
