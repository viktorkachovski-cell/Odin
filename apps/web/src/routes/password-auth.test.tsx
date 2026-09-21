import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type * as Data from '@odin/data';
import {
  createOdinClient,
  signInWithPassword,
  registerWithPassword,
  requestPasswordReset,
  updatePassword,
} from '@odin/data';
import { createTranslator } from '@odin/i18n';
import { OdinContext, type OdinContextValue } from '../app/OdinContext.ts';
import { setRecoveryUser } from '../auth-links.ts';
import { SignIn } from './SignIn.tsx';
import { Register } from './Register.tsx';
import { ForgotPassword, ResetPassword } from './PasswordRecovery.tsx';

vi.mock('@odin/data', async (original) => ({
  ...(await original<typeof Data>()),
  signInWithPassword: vi.fn(),
  registerWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}));
const client = createOdinClient({
  url: 'https://auth-test.supabase.co',
  publishableKey: 'test-only',
});
const context: OdinContextValue = {
  client,
  user: null,
  authReady: true,
  locale: 'en',
  setLocale: vi.fn(),
  t: createTranslator('en'),
  online: true,
  realtimeHealthy: true,
  setRealtimeHealthy: vi.fn(),
  signOut: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  setRecoveryUser(null);
});
function show(node: ReactNode, overrides: Partial<OdinContextValue> = {}, path = '/auth') {
  return render(
    <OdinContext value={{ ...context, ...overrides }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth" element={node} />
          <Route path="/invite" element={<p>Invitation destination</p>} />
        </Routes>
      </MemoryRouter>
    </OdinContext>,
  );
}
const password = 'synthetic password';
async function credentials(confirm = false, value = password): Promise<void> {
  await userEvent.type(screen.getByLabelText('Email address'), 'test@example.invalid');
  await userEvent.type(screen.getByLabelText('Password', { exact: true }), value);
  if (confirm) await userEvent.type(screen.getByLabelText('Confirm password'), value);
}

describe('password screens', () => {
  it('signs in an existing short-password account and preserves the invitation destination', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ ok: true, data: { id: 'u1', email: null } });
    show(<SignIn />, {}, '/auth?next=%2Finvite');
    await credentials(false, 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invitation destination')).toBeInTheDocument();
    expect(signInWithPassword).toHaveBeenCalledWith(client, 'test@example.invalid', 'short');
  });
  it('shows a safe invalid-credentials error and clears password', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message_key: 'auth.password.invalid_credentials' },
    });
    show(<SignIn />);
    await credentials();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
  });
  it('validates registration before making any request', async () => {
    show(<Register />);
    await credentials(true, 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8');
    expect(registerWithPassword).not.toHaveBeenCalled();
  });
  it('shows confirmation instructions and a resend cooldown without storing password', async () => {
    vi.mocked(registerWithPassword).mockResolvedValue({
      ok: true,
      data: { confirmationRequired: true },
    });
    show(<Register />);
    await credentials(true);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('confirmation link');
    expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /60s/ })).toBeDisabled();
    expect(registerWithPassword).toHaveBeenCalledWith(
      client,
      'test@example.invalid',
      password,
      `${window.location.origin}/auth/confirmed`,
    );
  });
  it('uses a generic password-reset acknowledgement', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ ok: true, data: null });
    show(<ForgotPassword />);
    await userEvent.type(screen.getByLabelText('Email address'), 'test@example.invalid');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an eligible account exists');
    expect(requestPasswordReset).toHaveBeenCalledWith(
      client,
      'test@example.invalid',
      `${window.location.origin}/reset-password`,
    );
  });
  it('refuses direct reset navigation using a normal signed-in session', () => {
    show(<ResetPassword />, { user: { id: 'u1', email: null } });
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or expired');
    expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument();
  });
  it('updates a recovered account password and clears the recovery marker', async () => {
    setRecoveryUser('u1');
    vi.mocked(updatePassword).mockResolvedValue({ ok: true, data: null });
    show(<ResetPassword />, { user: { id: 'u1', email: null } });
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), password);
    await userEvent.type(screen.getByLabelText('Confirm password'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odin.password-recovery')).toBeNull();
  });
  it('blocks offline submissions', async () => {
    show(<SignIn />, { online: false });
    await credentials();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await waitFor(() => expect(signInWithPassword).not.toHaveBeenCalled());
  });
});
