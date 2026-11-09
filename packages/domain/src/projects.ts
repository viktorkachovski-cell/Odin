/**
 * Projects group a household's active lists. The server owns membership
 * (`lists.project_id`) and both orders: projects alphabetically, lists by their
 * shared household order. This only partitions what it is given, so the two
 * clients render the same grouping and never re-sort it differently.
 */

export interface ProjectGroup<L, P> {
  readonly project: P;
  readonly lists: readonly L[];
}

export interface ProjectGrouping<L, P> {
  /** Every project, empty ones included, in the order given. */
  readonly groups: readonly ProjectGroup<L, P>[];
  /** Lists in no project, or naming one this read does not know. */
  readonly ungrouped: readonly L[];
}

/**
 * Partitions `lists` into the given `projects` and the rest, preserving the
 * order of both inputs. A list whose project is not in `projects` -- a project
 * deleted or created between two refetches -- is ungrouped rather than lost.
 */
export function groupListsByProject<
  L extends { readonly project_id?: string | null | undefined },
  P extends { readonly id: string },
>(lists: readonly L[], projects: readonly P[]): ProjectGrouping<L, P> {
  const byProject = new Map<string, L[]>(projects.map((project) => [project.id, []]));
  const ungrouped: L[] = [];
  for (const list of lists) {
    const members =
      list.project_id === null || list.project_id === undefined
        ? undefined
        : byProject.get(list.project_id);
    if (members === undefined) ungrouped.push(list);
    else members.push(list);
  }
  return {
    groups: projects.map((project) => ({ project, lists: byProject.get(project.id) ?? [] })),
    ungrouped,
  };
}

/**
 * Whether the Lists screen may offer Reorder. Active lists move only within
 * their project, so until the projects are known the screen would show grouped
 * lists flat and the arrows would point at the wrong neighbours. Templates are
 * never in a project and need not wait.
 */
export function canReorderLists(input: {
  readonly tab: 'active' | 'templates';
  readonly shownCount: number;
  readonly projectsKnown: boolean;
}): boolean {
  return input.shownCount > 1 && (input.tab === 'templates' || input.projectsKnown);
}
