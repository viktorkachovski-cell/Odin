import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import type { ListDto } from '@odin/contracts';
import * as data from '@odin/data';
import type * as OdinData from '@odin/data';
import type { OdinSupabaseClient } from '@odin/data';

jest.mock('@odin/data', () => {
  const actual = jest.requireActual<typeof OdinData>('@odin/data');
  return { ...actual, createList: jest.fn(), updateList: jest.fn() };
});

import { useListEditorCommand } from './useListEditorCommand.ts';

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

function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

it('retries the original create and saves newer edits as an update', async () => {
  const create = jest.mocked(data.createList);
  const update = jest.mocked(data.updateList);
  create
    .mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK', message_key: 'error.network' } })
    .mockResolvedValueOnce({ ok: true, data: saved });
  update.mockResolvedValueOnce({
    ok: true,
    data: { ...saved, title: 'Newer title', version: 2 },
  });
  const { result } = await renderHook(() => useListEditorCommand({} as OdinSupabaseClient), {
    wrapper: Wrapper,
  });
  const firstDraft = { title: 'First title', subtitle: '', notes: '' };
  const newerDraft = { ...firstDraft, title: 'Newer title' };

  await act(() => {
    result.current.open();
  });
  await act(() => {
    result.current.submit({ title: 'First title', subtitle: null, notes: null }, firstDraft, null);
  });
  await waitFor(() => expect(result.current.command.state.error?.code).toBe('NETWORK'));
  await act(() => {
    result.current.onDraftChange(newerDraft);
  });
  await act(async () => {
    await result.current.command.retry();
  });

  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0]?.[1]).toBe(create.mock.calls[1]?.[1]);
  expect(create.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ title: 'First title' }));
  expect(result.current.editing).toBe(true);
  expect(result.current.retainedDraft).toBe(true);
  expect(result.current.confirmedList).toEqual(saved);

  await act(() => {
    result.current.submit({ title: 'Newer title', subtitle: null, notes: null }, newerDraft, null);
  });
  await waitFor(() => expect(result.current.editing).toBe(false));
  expect(update.mock.calls[0]?.[1]).not.toBe(create.mock.calls[0]?.[1]);
  expect(update.mock.calls[0]?.[2]).toEqual(
    expect.objectContaining({ listId: saved.id, expectedVersion: 1, title: 'Newer title' }),
  );
});
