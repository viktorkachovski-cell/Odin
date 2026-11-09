import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import { groupListsByProject } from '@odin/domain';
import { createTranslator } from '@odin/i18n';

import { ActiveListRow } from '../routes/ListsParts.tsx';
import { ProjectSections } from '../routes/ProjectSections.tsx';
import { ListEditor } from './ListEditor.tsx';
import { MoveToProjectDialog } from './MoveToProjectDialog.tsx';
import { ProjectDialog } from './ProjectDialog.tsx';

const t = createTranslator('en');

function project(id: string, name: string, listCount = 0): ProjectSummaryDto {
  return {
    id,
    household_id: 'h1',
    name,
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    list_count: listCount,
  };
}

function list(id: string, title: string, projectId: string | null): ListSummaryDto {
  return {
    id,
    kind: 'active',
    title,
    subtitle: null,
    notes: null,
    status: 'open',
    version: 4,
    total_tasks: 4,
    completed_tasks: 1,
    project_id: projectId,
  };
}

const garden = project('p1', 'Garden');
const move = project('p2', 'Moving house');

describe('ProjectDialog', () => {
  it('creates a project from a trimmed name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProjectDialog
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        project={null}
        t={t}
      />,
    );

    await user.type(screen.getByLabelText('Project name'), '  Garden  ');
    await user.click(screen.getByRole('button', { name: 'Save project' }));

    expect(onSubmit).toHaveBeenCalledWith('Garden');
  });

  it('submits with Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProjectDialog
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        project={null}
        t={t}
      />,
    );

    await user.type(screen.getByLabelText('Project name'), 'Garden{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('Garden');
  });

  it('refuses a blank name without calling the server', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProjectDialog
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        project={null}
        t={t}
      />,
    );

    await user.type(screen.getByLabelText('Project name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save project' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a project name.')).toBeInTheDocument();
  });

  it('refuses a name over 160 characters', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProjectDialog
        error={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        project={null}
        t={t}
      />,
    );

    await user.click(screen.getByLabelText('Project name'));
    await user.paste('x'.repeat(161));
    await user.click(screen.getByRole('button', { name: 'Save project' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Use between 1 and 160 characters.')).toBeInTheDocument();
  });

  it('starts a rename from the current name', () => {
    render(
      <ProjectDialog
        error={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        project={garden}
        t={t}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Rename project' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toHaveValue('Garden');
  });

  it('shows a conflict and keeps what was typed', () => {
    render(
      <ProjectDialog
        error={{ code: 'CONFLICT', message_key: 'error.conflict', current_version: 3 }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        project={garden}
        t={t}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Someone else changed this first');
    expect(screen.getByLabelText('Project name')).toHaveValue('Garden');
  });
});

describe('MoveToProjectDialog', () => {
  it('starts on the current project and offers none', () => {
    render(
      <MoveToProjectDialog
        error={null}
        list={list('l1', 'Shed', 'p1')}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        projects={[garden, move]}
        t={t}
      />,
    );

    const select = screen.getByLabelText('Project');
    expect(select).toHaveValue('p1');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['No project', 'Garden', 'Moving house']);
  });

  it('moves the list to the chosen project', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MoveToProjectDialog
        error={null}
        list={list('l1', 'Shed', null)}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        projects={[garden, move]}
        t={t}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Project'), 'p2');
    await user.click(screen.getByRole('button', { name: 'Move list' }));

    expect(onSubmit).toHaveBeenCalledWith('p2');
  });

  it('takes the list out of its project with No project', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MoveToProjectDialog
        error={null}
        list={list('l1', 'Shed', 'p1')}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        projects={[garden]}
        t={t}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Project'), '');
    await user.click(screen.getByRole('button', { name: 'Move list' }));

    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});

describe('ListEditor with projects', () => {
  const props = {
    error: null,
    list: null,
    onCancel: vi.fn(),
    pending: false,
    t,
  } as const;

  it('offers no project field before the household has a project', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ListEditor {...props} onSubmit={onSubmit} />);

    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('List title'), 'Pantry');
    await user.click(screen.getByRole('button', { name: 'Save list' }));

    // No project key at all keeps the installed create RPC in use.
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Pantry', subtitle: null, notes: null });
  });

  it('creates the list in the project it was opened for', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListEditor {...props} initialProjectId="p2" onSubmit={onSubmit} projects={[garden, move]} />,
    );

    expect(screen.getByLabelText('Project')).toHaveValue('p2');
    await user.type(screen.getByLabelText('List title'), 'Boxes');
    await user.click(screen.getByRole('button', { name: 'Save list' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Boxes',
      subtitle: null,
      notes: null,
      projectId: 'p2',
    });
  });

  it('creates an ungrouped list when no project is chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ListEditor {...props} onSubmit={onSubmit} projects={[garden]} />);

    await user.type(screen.getByLabelText('List title'), 'Loose');
    await user.click(screen.getByRole('button', { name: 'Save list' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }));
  });

  it('does not offer a project when editing an existing list', () => {
    render(
      <ListEditor
        {...props}
        list={{
          id: 'l1',
          household_id: 'h1',
          kind: 'active',
          title: 'Shed',
          subtitle: null,
          notes: null,
          status: 'open',
          seed_key: null,
          created_by: 'u1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          version: 1,
        }}
        onSubmit={vi.fn()}
        projects={[garden]}
      />,
    );

    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument();
  });
});

describe('ProjectSections', () => {
  const lists = [list('l1', 'Shed', 'p1'), list('l2', 'Loose', null), list('l3', 'Lawn', 'p1')];

  function renderSections(overrides: { readonly onDelete?: () => void } = {}) {
    const handlers = {
      onAddList: vi.fn(),
      onRename: vi.fn(),
      onDelete: overrides.onDelete ?? vi.fn(),
    };
    render(
      <MemoryRouter>
        <ProjectSections
          busy={false}
          grouping={groupListsByProject(lists, [garden, move])}
          renderRows={(rows) =>
            rows.map((row) => (
              <ActiveListRow
                busy={false}
                key={row.id}
                list={row}
                moveDownDisabled
                moveUpDisabled
                onDelete={vi.fn()}
                onMove={vi.fn()}
                reorder={false}
                t={t}
              />
            ))
          }
          t={t}
          {...handlers}
        />
      </MemoryRouter>,
    );
    return handlers;
  }

  it('groups lists under their project, empty projects included, and the rest last', () => {
    renderSections();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Garden', 'Moving house', 'Other lists']);

    const gardenSection = screen.getByRole('region', { name: 'Garden' });
    expect(within(gardenSection).getByText('Shed')).toBeInTheDocument();
    expect(within(gardenSection).getByText('Lawn')).toBeInTheDocument();
    expect(within(gardenSection).queryByText('Loose')).not.toBeInTheDocument();
    expect(within(gardenSection).getByText('Lists · 2')).toBeInTheDocument();

    expect(
      within(screen.getByRole('region', { name: 'Moving house' })).getByText(
        'No lists in this project yet.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Other lists' })).getByText('Loose'),
    ).toBeInTheDocument();
  });

  it('shows no Other lists section when every list is in a project', () => {
    render(
      <MemoryRouter>
        <ProjectSections
          busy={false}
          grouping={groupListsByProject([list('l1', 'Shed', 'p1')], [garden])}
          onAddList={vi.fn()}
          onDelete={vi.fn()}
          onRename={vi.fn()}
          renderRows={() => null}
          t={t}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('region', { name: 'Other lists' })).not.toBeInTheDocument();
  });

  it('adds a list to the project it belongs to', async () => {
    const user = userEvent.setup();
    const handlers = renderSections();

    await user.click(screen.getByRole('button', { name: 'New list in Moving house' }));

    expect(handlers.onAddList).toHaveBeenCalledWith(move);
  });

  it('renames and deletes through the project menu', async () => {
    const user = userEvent.setup();
    const handlers = renderSections();

    await user.click(screen.getByRole('button', { name: 'Project actions: Garden' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename project' }));
    expect(handlers.onRename).toHaveBeenCalledWith(garden);

    await user.click(screen.getByRole('button', { name: 'Project actions: Garden' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    expect(handlers.onDelete).toHaveBeenCalledWith(garden);
  });
});
