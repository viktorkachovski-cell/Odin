import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from '@odin/data';
import { createOdinClient, getCurrentUser, onAuthStateChange, type AuthUser } from '@odin/data';
import { OdinProvider } from './OdinProvider.tsx';
import { useOdin } from './OdinContext.ts';

vi.mock('@odin/data', async (original) => ({
  ...(await original<typeof Data>()),
  getCurrentUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
const client = createOdinClient({
  url: 'https://auth-test.supabase.co',
  publishableKey: 'test-only',
});
let notify: (user: AuthUser | null) => void;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onAuthStateChange).mockImplementation((_client, listener) => {
    notify = listener;
    return vi.fn();
  });
});
function Identity() {
  const { user } = useOdin();
  return <p>{user?.id ?? 'signed out'}</p>;
}

describe('auth identity transitions', () => {
  it('clears cached household data on account change and external signout', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', email: null });
    const queries = new QueryClient();
    render(
      <OdinProvider client={client} queryClient={queries}>
        <Identity />
      </OdinProvider>,
    );
    await screen.findByText('u1');
    queries.setQueryData(['household'], 'synthetic household');
    act(() => notify({ id: 'u2', email: null }));
    expect(queries.getQueryData(['household'])).toBeUndefined();
    expect(screen.getByText('u2')).toBeInTheDocument();
    queries.setQueryData(['household'], 'other synthetic household');
    act(() => notify(null));
    expect(queries.getQueryData(['household'])).toBeUndefined();
    expect(screen.getByText('signed out')).toBeInTheDocument();
  });
  it('does not let an older initial session overwrite a newer login event', async () => {
    let finishInitial: (value: AuthUser | null) => void = () => undefined;
    vi.mocked(getCurrentUser).mockReturnValue(
      new Promise((resolve) => {
        finishInitial = resolve;
      }),
    );
    render(
      <OdinProvider client={client}>
        <Identity />
      </OdinProvider>,
    );
    act(() => notify({ id: 'u2', email: null }));
    await act(async () => {
      finishInitial({ id: 'u1', email: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('u2')).toBeInTheDocument());
  });
});
