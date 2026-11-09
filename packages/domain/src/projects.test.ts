import { describe, expect, it } from 'vitest';

import { LIMITS } from '@odin/contracts';

import { groupListsByProject } from './projects.ts';
import { validateProjectName } from './validation.ts';

const projects = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];

describe('groupListsByProject', () => {
  it('partitions lists under their projects, keeping both orders', () => {
    const lists = [
      { id: 'a', project_id: 'p2' },
      { id: 'b', project_id: null },
      { id: 'c', project_id: 'p1' },
      { id: 'd', project_id: 'p2' },
      { id: 'e' },
    ];

    const { groups, ungrouped } = groupListsByProject(lists, projects);

    expect(groups.map((group) => [group.project.id, group.lists.map((list) => list.id)])).toEqual([
      ['p1', ['c']],
      ['p2', ['a', 'd']],
      ['p3', []],
    ]);
    expect(ungrouped.map((list) => list.id)).toEqual(['b', 'e']);
  });

  it('never loses a list whose project is not in this read', () => {
    const { groups, ungrouped } = groupListsByProject([{ id: 'a', project_id: 'gone' }], projects);

    expect(groups.every((group) => group.lists.length === 0)).toBe(true);
    expect(ungrouped.map((list) => list.id)).toEqual(['a']);
  });

  it('puts every list in the ungrouped bucket when there are no projects', () => {
    const lists = [{ id: 'a' }, { id: 'b', project_id: 'p1' }];

    const { groups, ungrouped } = groupListsByProject(lists, []);

    expect(groups).toEqual([]);
    expect(ungrouped).toEqual(lists);
  });

  it('keeps an empty project as a group', () => {
    const { groups } = groupListsByProject([], [{ id: 'p1' }]);

    expect(groups).toEqual([{ project: { id: 'p1' }, lists: [] }]);
  });
});

describe('validateProjectName', () => {
  it('requires a name', () => {
    expect(validateProjectName('   ')?.message_key).toBe('validation.project_name.required');
    expect(validateProjectName(null)?.message_key).toBe('validation.project_name.required');
  });

  it('accepts the shared limit in code points and refuses one more', () => {
    expect(validateProjectName('я'.repeat(LIMITS.projectName.max))).toBeNull();
    expect(validateProjectName('я'.repeat(LIMITS.projectName.max + 1))?.message_key).toBe(
      'validation.project_name.length',
    );
  });
});
