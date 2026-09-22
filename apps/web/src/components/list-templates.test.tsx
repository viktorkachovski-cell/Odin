import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { ListDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ListEditor } from './ListEditor.tsx';
import { ListHeader, TemplateSavedNotice } from './ListDetailParts.tsx';

/**
 * The list note and the save-as-list-template action, which are the two ways a
 * list differs from before. A task template stays a separate type, so nothing
 * here should ever reach the task-template surface.
 */

const t = createTranslator('en');

function makeList(overrides: Partial<ListDto> = {}): ListDto {
  return {
    id: 'l1',
    household_id: 'h1',
    kind: 'active',
    title: 'Pantry',
    subtitle: 'Weekly',
    notes: 'Buy the good olive oil',
    status: 'open',
    seed_key: null,
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('ListEditor', () => {
  it('offers the note after the subtitle and submits what was typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListEditor
        error={null}
        list={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        t={t}
      />,
    );

    const labels = screen.getAllByText(/List title|Subtitle \(optional\)|Notes \(optional\)/);
    expect(labels.map((label) => label.textContent)).toEqual([
      'List title',
      'Subtitle (optional)',
      'Notes (optional)',
    ]);

    await user.type(screen.getByLabelText('List title'), 'Pantry');
    await user.type(screen.getByLabelText('Notes (optional)'), 'Buy the good olive oil');
    await user.click(screen.getByRole('button', { name: 'Save list' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Pantry',
      subtitle: null,
      notes: 'Buy the good olive oil',
    });
  });

  it('starts from the list the household already has', () => {
    render(
      <ListEditor
        error={null}
        list={makeList()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
        t={t}
      />,
    );

    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Buy the good olive oil');
  });

  it('rejects a note over the shared 5,000 limit before it reaches the server', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListEditor
        error={null}
        list={makeList({ notes: 'x'.repeat(5001) })}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        t={t}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save list' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Use at most 5,000 characters.')).toBeInTheDocument();
  });
});

describe('ListHeader', () => {
  function renderHeader(overrides: { readonly onSaveTemplate?: () => void } = {}): void {
    render(
      <MemoryRouter>
        <ListHeader
          isTemplate={false}
          notes="Buy the good olive oil"
          onAddTask={vi.fn()}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onSaveTemplate={overrides.onSaveTemplate ?? vi.fn()}
          pending={false}
          subtitle="Weekly"
          t={t}
          title="Pantry"
        />
      </MemoryRouter>,
    );
  }

  it('shows the note under the subtitle', () => {
    renderHeader();

    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText('Buy the good olive oil')).toBeInTheDocument();
  });

  it('saves the list as a list template from the overflow, not as a task template', async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();
    renderHeader({ onSaveTemplate });

    await user.click(screen.getByRole('button', { name: 'List actions' }));
    expect(
      screen.queryByRole('menuitem', { name: 'Save as task template' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Save as list template' }));
    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it('offers a template nothing but Delete, since it is otherwise read-only', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <MemoryRouter>
        <ListHeader
          isTemplate
          notes={null}
          onAddTask={vi.fn()}
          onDelete={onDelete}
          onEdit={vi.fn()}
          onSaveTemplate={vi.fn()}
          pending={false}
          subtitle={null}
          t={t}
          title="Weekly cleaning"
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List actions' }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAccessibleName('Delete list');

    await user.click(screen.getByRole('menuitem', { name: 'Delete list' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the full menu and the Add task primary on an active list', async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List actions' }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(screen.getByRole('menuitem', { name: 'Edit list' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Save as list template' })).toBeInTheDocument();
    // The overflow orders destructive entries last whatever the caller passed.
    expect(items.at(-1)).toHaveAccessibleName('Delete list');
  });
});

describe('TemplateSavedNotice', () => {
  it('confirms a save once it has happened', () => {
    render(<TemplateSavedNotice error={null} saved t={t} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'List template saved. It is available to your household.',
    );
  });

  it('stays quiet before a save and while an error is on screen', () => {
    const { rerender } = render(<TemplateSavedNotice error={null} saved={false} t={t} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(
      <TemplateSavedNotice
        error={{ code: 'NOT_FOUND', message_key: 'error.not_found' }}
        saved
        t={t}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
