import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ListDto } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { ListEditor, type ListEditorProps } from './ListEditor.tsx';

const saved: ListDto = {
  id: 'list-1',
  household_id: 'home-1',
  kind: 'active',
  title: 'First title',
  subtitle: null,
  notes: null,
  status: 'open',
  seed_key: null,
  created_by: 'member-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 1,
};

it('keeps later edits mounted when a timed-out create is confirmed', async () => {
  const props: ListEditorProps = {
    list: null,
    t: createTranslator('en'),
    pending: false,
    error: null,
    onCancel: jest.fn(),
    onRetry: jest.fn(),
    onDraftChange: jest.fn(),
    onSubmit: jest.fn(),
  };
  const view = await render(<ListEditor {...props} />);
  await fireEvent.changeText(screen.getByLabelText('List title'), 'First title');
  await fireEvent.press(screen.getByRole('button', { name: 'Save list' }));
  await view.rerender(
    <ListEditor {...props} error={{ code: 'NETWORK', message_key: 'error.network' }} />,
  );
  await fireEvent.changeText(screen.getByDisplayValue('First title'), 'Newer title');
  expect(screen.getByRole('button', { name: 'Save list' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  await view.rerender(<ListEditor {...props} list={saved} retainedDraft />);
  expect(screen.getByDisplayValue('Newer title')).toBeTruthy();
  expect(screen.getByText(/Your earlier save succeeded/)).toBeTruthy();
});
