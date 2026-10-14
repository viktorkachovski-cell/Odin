import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { ListSummaryDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

/**
 * Expo Router's navigation package ships untranspiled, and the card only
 * pushes a route, so the suite records the push instead.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]): unknown => mockPush(...args) },
}));

import { ListCard } from './ListCard.tsx';

const t = createTranslator('en');

function summary(overrides: Partial<ListSummaryDto> = {}): ListSummaryDto {
  return {
    id: 'l1',
    kind: 'active',
    title: 'Pantry',
    subtitle: 'Weekly',
    notes: 'Buy the good olive oil',
    status: 'open',
    version: 1,
    total_tasks: 2,
    completed_tasks: 1,
    ...overrides,
  };
}

describe('ListCard', () => {
  beforeEach(() => mockPush.mockClear());

  it('opens an active list from a row that keeps its width', async () => {
    await render(<ListCard list={summary()} onDelete={jest.fn()} t={t} />);

    const link = screen.getByRole('link');
    // The 2026-10-14 release lost this flex to `Link asChild`, and titles
    // wrapped a few characters per line beside the menu.
    expect(StyleSheet.flatten(link.props.style)).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0 }),
    );

    await fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/list/[id]', params: { id: 'l1' } });
  });

  it('opens a template, and Use template only copies it', async () => {
    const onCopy = jest.fn();
    await render(<ListCard list={summary({ kind: 'template' })} onCopy={onCopy} t={t} />);

    await fireEvent.press(screen.getByLabelText('Create list from Pantry'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('link'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/list/[id]', params: { id: 'l1' } });
  });

  it('shows the shared note under the subtitle', async () => {
    await render(<ListCard list={summary()} t={t} />);

    expect(screen.getByText('Weekly')).toBeTruthy();
    expect(screen.getByText('Buy the good olive oil')).toBeTruthy();
  });

  it('saves an active list as a template from its menu', async () => {
    const onSaveTemplate = jest.fn();
    await render(
      <ListCard list={summary()} onDelete={jest.fn()} onSaveTemplate={onSaveTemplate} t={t} />,
    );

    await fireEvent.press(screen.getByLabelText('List actions: Pantry'));
    await fireEvent.press(screen.getByText('Save as list template'));

    expect(onSaveTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });

  it('offers Use template on a template row', async () => {
    const onCopy = jest.fn();
    await render(<ListCard list={summary({ kind: 'template' })} onCopy={onCopy} t={t} />);

    await fireEvent.press(screen.getByLabelText('Create list from Pantry'));
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
  });

  it('keeps deletion in the overflow and never offers task-template actions', async () => {
    await render(<ListCard list={summary()} onDelete={jest.fn()} t={t} />);

    await fireEvent.press(screen.getByLabelText('List actions: Pantry'));

    expect(screen.queryByText('Save as task template')).toBeNull();
    expect(screen.getByText('Delete list')).toBeTruthy();
    expect(screen.queryByText('Save as list template')).toBeNull();
  });

  it('lets a template be deleted but never saved as another template', async () => {
    const onDelete = jest.fn();
    await render(
      <ListCard
        list={summary({ kind: 'template', notes: null })}
        onDelete={onDelete}
        onSaveTemplate={jest.fn()}
        t={t}
      />,
    );

    await fireEvent.press(screen.getByLabelText('List actions: Pantry'));
    expect(screen.queryByText('Save as list template')).toBeNull();

    await fireEvent.press(screen.getByText('Delete list'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'template' }));
  });

  it('exposes ordered-list controls in reorder mode with the boundary disabled', async () => {
    const onMove = jest.fn();
    await render(
      <ListCard
        list={summary()}
        moveUpDisabled
        onDelete={jest.fn()}
        onMove={onMove}
        reorder
        t={t}
      />,
    );

    expect(screen.getByLabelText('Move Pantry up')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Move Pantry down'));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 'down');
  });

  it('refuses a second move while one is in flight', async () => {
    const onMove = jest.fn();
    await render(<ListCard list={summary()} movePending onMove={onMove} reorder t={t} />);

    expect(screen.getByLabelText('Move Pantry up')).toBeDisabled();
    expect(screen.getByLabelText('Move Pantry down')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Move Pantry down'));
    expect(onMove).not.toHaveBeenCalled();
  });
});
