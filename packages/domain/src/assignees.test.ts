import { describe, expect, it } from 'vitest';

import type { MemberDto } from '@odin/contracts';

import {
  assigneeEntries,
  canAddAssignee,
  canonicalAssigneeIds,
  isAssignedTo,
  isUnassigned,
  memberLabels,
  mergeAssigneeEdit,
  sameAssigneeSet,
  summarizeAssignees,
  taskAssigneeIds,
  withAssignee,
  withoutAssignee,
} from './assignees.ts';

const member = (user_id: string, display_name: string): MemberDto => ({
  user_id,
  display_name,
  avatar_ref: null,
});

describe('the assignment set', () => {
  it('reads the set, or the single assignee of an older payload', () => {
    expect(taskAssigneeIds({ assignee_id: 'a', assignee_ids: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(taskAssigneeIds({ assignee_id: 'a' })).toEqual(['a']);
    expect(taskAssigneeIds({ assignee_id: null })).toEqual([]);
    expect(taskAssigneeIds({ assignee_id: 'a', assignee_ids: [] })).toEqual([]);
  });

  it('answers is-mine and is-unassigned from the set', () => {
    const task = { assignee_id: 'a', assignee_ids: ['a', 'b'] };
    expect(isAssignedTo(task, 'b')).toBe(true);
    expect(isAssignedTo(task, 'c')).toBe(false);
    expect(isAssignedTo(task, null)).toBe(false);
    expect(isUnassigned(task)).toBe(false);
    expect(isUnassigned({ assignee_id: null, assignee_ids: [] })).toBe(true);
  });

  it('canonicalises to distinct ids in ascending order', () => {
    expect(canonicalAssigneeIds(['b', 'a', 'b'])).toEqual(['a', 'b']);
    expect(sameAssigneeSet(['b', 'a'], ['a', 'b', 'a'])).toBe(true);
    expect(sameAssigneeSet(['a'], ['a', 'b'])).toBe(false);
  });

  it('adds and removes one member without disturbing the others', () => {
    expect(withAssignee(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(withAssignee(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(withoutAssignee(['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
    expect(withoutAssignee(['a'], 'x')).toEqual(['a']);
  });

  it('stops offering members once the set is full', () => {
    const full = Array.from({ length: 50 }, (_, index) => `u${String(index).padStart(2, '0')}`);
    expect(canAddAssignee(full.slice(1))).toBe(true);
    expect(canAddAssignee(full)).toBe(false);
  });
});

describe('member labels', () => {
  it('keeps unique names as they are and numbers duplicates in user-id order', () => {
    const labels = memberLabels([
      member('3', 'Ana'),
      member('1', 'Ana'),
      member('2', 'Boris'),
      member('4', 'Ana'),
    ]);
    expect(labels.get('1')).toBe('Ana');
    expect(labels.get('3')).toBe('Ana (2)');
    expect(labels.get('4')).toBe('Ana (3)');
    expect(labels.get('2')).toBe('Boris');
  });

  it('names a member the same whatever order the list arrives in', () => {
    const members = [member('1', 'Ana'), member('2', 'Ana')];
    expect(memberLabels(members).get('2')).toBe(memberLabels([...members].reverse()).get('2'));
  });
});

describe('assignee entries', () => {
  const members = [
    member('1', 'Zora'),
    member('2', 'Ana'),
    member('3', 'Ana'),
    member('4', 'Boris'),
  ];

  it('puts the member first, then others by name, then former members', () => {
    const entries = assigneeEntries(['2', '1', '4', 'gone'], members, '1');
    expect(entries.map((entry) => entry.userId)).toEqual(['1', '2', '4', 'gone']);
    expect(entries[0]).toMatchObject({ isYou: true, former: false, name: 'Zora' });
    expect(entries[3]).toMatchObject({ former: true, name: '' });
  });

  it('tells two members with one name apart', () => {
    const entries = assigneeEntries(['2', '3'], members, '4');
    expect(entries.map((entry) => entry.name)).toEqual(['Ana', 'Ana (2)']);
  });

  it('summarises long sets as the first few plus a count', () => {
    const entries = assigneeEntries(['1', '2', '3', '4'], members, null);
    expect(summarizeAssignees(entries, 2)).toMatchObject({ more: 2 });
    expect(summarizeAssignees(entries, 2).shown).toHaveLength(2);
    expect(summarizeAssignees(entries.slice(0, 1), 2)).toMatchObject({ more: 0 });
  });
});

describe('merging an editor draft onto a newer version', () => {
  it('keeps a member someone else added while the editor was open', () => {
    expect(mergeAssigneeEdit(['a'], ['a', 'b'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it("applies the member's removal and leaves others' additions alone", () => {
    expect(mergeAssigneeEdit(['a', 'b'], ['b'], ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });

  it('does not resurrect someone the member removed and another also removed', () => {
    expect(mergeAssigneeEdit(['a', 'b'], ['a'], ['a'])).toEqual(['a']);
  });

  it('is the draft itself when nothing else changed', () => {
    expect(mergeAssigneeEdit(['a', 'b'], ['c'], ['a', 'b'])).toEqual(['c']);
    expect(mergeAssigneeEdit([], [], ['x'])).toEqual(['x']);
  });

  it('keeps a clear-everyone edit from erasing a member added meanwhile', () => {
    expect(mergeAssigneeEdit(['a'], [], ['a', 'b'])).toEqual(['b']);
  });
});
