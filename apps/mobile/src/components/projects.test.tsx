import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ListDto, ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

/** The card pushes a route; the suite records it rather than loading Expo Router. */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { ListCard } from './ListCard.tsx';
import { ListEditor } from './ListEditor.tsx';
import { ListsBody, ListsToolbar } from './ListsBody.tsx';
import { MoveToProjectSheet } from './MoveToProjectSheet.tsx';
import { ProjectEditor } from './ProjectEditor.tsx';

const t = createTranslator('en');

function project(id: string, name: string): ProjectSummaryDto {
  return {
    id,
    household_id: 'h1',
    name,
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 2,
    list_count: 0,
  };
}

function summary(id: string, title: string, projectId: string | null): ListSummaryDto {
  return {
    id,
    kind: 'active',
    title,
    subtitle: null,
    notes: null,
    status: 'open',
    version: 4,
    total_tasks: 2,
    completed_tasks: 1,
    project_id: projectId,
  };
}

const garden = project('p1', 'Garden');
const moving = project('p2', 'Moving house');

describe('ProjectEditor', () => {
  it('creates a project from a trimmed name', async () => {
    const onSubmit = jest.fn();
    await render(
      <ProjectEditor
        error={null}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
        pending={false}
        project={null}
        t={t}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Project name'), '  Garden  ');
    await fireEvent.press(screen.getByText('Save project'));

    expect(onSubmit).toHaveBeenCalledWith('Garden');
  });

  it('refuses a blank name without calling the server', async () => {
    const onSubmit = jest.fn();
    await render(
      <ProjectEditor
        error={null}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
        pending={false}
        project={null}
        t={t}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Project name'), '   ');
    await fireEvent.press(screen.getByText('Save project'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a project name.')).toBeTruthy();
  });

  it('starts a rename from the current name', async () => {
    await render(
      <ProjectEditor
        error={null}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
        pending={false}
        project={garden}
        t={t}
      />,
    );

    expect(screen.getByText('Rename project')).toBeTruthy();
    expect(screen.getByLabelText('Project name').props.value).toBe('Garden');
  });
});

describe('MoveToProjectSheet', () => {
  it('moves the list to the chosen project', async () => {
    const onSubmit = jest.fn();
    await render(
      <MoveToProjectSheet
        error={null}
        list={summary('l1', 'Shed', null)}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
        pending={false}
        projects={[garden, moving]}
        t={t}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Moving house'));
    await fireEvent.press(screen.getByText('Move list'));

    expect(onSubmit).toHaveBeenCalledWith('p2');
  });

  it('takes the list out of its project with No project', async () => {
    const onSubmit = jest.fn();
    await render(
      <MoveToProjectSheet
        error={null}
        list={summary('l1', 'Shed', 'p1')}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
        pending={false}
        projects={[garden]}
        t={t}
      />,
    );

    await fireEvent.press(screen.getByLabelText('No project'));
    await fireEvent.press(screen.getByText('Move list'));

    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});

describe('ListEditor with projects', () => {
  const base = { error: null, list: null as ListDto | null, onCancel: jest.fn(), pending: false };

  it('offers no project choice before the household has a project', async () => {
    const onSubmit = jest.fn();
    await render(<ListEditor {...base} onSubmit={onSubmit} t={t} />);

    expect(screen.queryByText('Project')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('List title'), 'Pantry');
    await fireEvent.press(screen.getByText('Save list'));

    // No project key at all keeps the installed create RPC in use.
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Pantry', subtitle: null, notes: null });
  });

  it('creates the list in the project it was opened for', async () => {
    const onSubmit = jest.fn();
    await render(
      <ListEditor
        {...base}
        initialProjectId="p2"
        onSubmit={onSubmit}
        projects={[garden, moving]}
        t={t}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('List title'), 'Boxes');
    await fireEvent.press(screen.getByText('Save list'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p2' }));
  });

  it('creates an ungrouped list when No project is chosen', async () => {
    const onSubmit = jest.fn();
    await render(
      <ListEditor {...base} initialProjectId="p1" onSubmit={onSubmit} projects={[garden]} t={t} />,
    );

    await fireEvent.press(screen.getByLabelText('No project'));
    await fireEvent.changeText(screen.getByLabelText('List title'), 'Loose');
    await fireEvent.press(screen.getByText('Save list'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }));
  });
});

describe('ListCard project action', () => {
  it('offers Move to project on an active list', async () => {
    const onMoveToProject = jest.fn();
    await render(
      <ListCard
        list={summary('l1', 'Shed', null)}
        onDelete={jest.fn()}
        onMoveToProject={onMoveToProject}
        t={t}
      />,
    );

    await fireEvent.press(screen.getByLabelText('List actions: Shed'));
    await fireEvent.press(screen.getByText('Move to project'));

    expect(onMoveToProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });

  it('never offers it on a template', async () => {
    await render(
      <ListCard
        list={{ ...summary('l1', 'Shed', null), kind: 'template' }}
        onDelete={jest.fn()}
        onMoveToProject={jest.fn()}
        t={t}
      />,
    );

    await fireEvent.press(screen.getByLabelText('List actions: Shed'));

    expect(screen.queryByText('Move to project')).toBeNull();
  });
});

describe('ListsBody', () => {
  const lists = [
    summary('l1', 'Shed', 'p1'),
    summary('l2', 'Loose', null),
    summary('l3', 'Lawn', 'p1'),
  ];
  const handlers = { onAddList: jest.fn(), onDelete: jest.fn(), onRename: jest.fn() };

  function renderBody(projects: readonly ProjectSummaryDto[]) {
    return render(
      <ListsBody
        {...handlers}
        active={lists}
        busy={false}
        projects={projects}
        renderCards={(rows) =>
          rows.map((row) => <ListCard key={row.id} list={row} onDelete={jest.fn()} t={t} />)
        }
        shown={lists}
        t={t}
        tab="active"
      />,
    );
  }

  it('shows a plain list of cards before the household has a project', async () => {
    await renderBody([]);

    expect(screen.getByText('Shed')).toBeTruthy();
    expect(screen.getByText('Loose')).toBeTruthy();
    expect(screen.queryByText('Other lists')).toBeNull();
  });

  it('groups lists under their project, empty projects included, and the rest last', async () => {
    await renderBody([garden, moving]);

    const headers = screen.getAllByRole('header').map((header) => String(header.props.children));
    expect(headers).toEqual(['Garden', 'Moving house', 'Other lists']);
    expect(screen.getByText('Lists · 2')).toBeTruthy();
    expect(screen.getByText('No lists in this project yet.')).toBeTruthy();
  });

  it('adds a list to the project it belongs to', async () => {
    await renderBody([garden, moving]);

    await fireEvent.press(screen.getByLabelText('New list in Moving house'));

    expect(handlers.onAddList).toHaveBeenCalledWith(moving);
  });

  it('renames and deletes through the project menu', async () => {
    await renderBody([garden]);

    await fireEvent.press(screen.getByLabelText('Project actions: Garden'));
    await fireEvent.press(screen.getByText('Rename project'));
    expect(handlers.onRename).toHaveBeenCalledWith(garden);

    await fireEvent.press(screen.getByLabelText('Project actions: Garden'));
    await fireEvent.press(screen.getByText('Delete project'));
    expect(handlers.onDelete).toHaveBeenCalledWith(garden);
  });
});

describe('ListsToolbar', () => {
  const props = {
    busy: false,
    onNewProject: jest.fn(),
    onToggleReorder: jest.fn(),
    reorderable: true,
    reordering: false,
    t,
  } as const;

  it('creates a project from the Active tab only', async () => {
    const { rerender } = await render(<ListsToolbar {...props} tab="active" />);
    await fireEvent.press(screen.getByText('New project'));
    expect(props.onNewProject).toHaveBeenCalledTimes(1);

    await rerender(<ListsToolbar {...props} tab="templates" />);
    expect(screen.queryByText('New project')).toBeNull();
  });
});
