import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { commandError, type CommandResult } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { OdinContext, type OdinContextValue } from './OdinContext.ts';

/**
 * Behaviour of the three password screens. The data layer is mocked so nothing
 * here reaches a network or a real inbox; these prove the client-side rules
 * only, never mail delivery.
 */

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: readonly unknown[]): void => {
      mockReplace(...args);
    },
    push: (...args: readonly unknown[]): void => {
      mockPush(...args);
    },
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@odin/data', () => ({
  signInWithPassword: jest.fn(),
  registerWithPassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resendConfirmation: jest.fn(),
}));

const data = jest.requireMock<{
  signInWithPassword: jest.Mock;
  registerWithPassword: jest.Mock;
  requestPasswordReset: jest.Mock;
  resendConfirmation: jest.Mock;
}>('@odin/data');

import SignInScreen from '../../app/sign-in.tsx';
import RegisterScreen from '../../app/register.tsx';
import ForgotPasswordScreen from '../../app/forgot-password.tsx';

function wrapper(overrides: Partial<OdinContextValue> = {}) {
  const value: OdinContextValue = {
    client: {} as OdinContextValue['client'],
    user: null,
    authReady: true,
    locale: 'en',
    setLocale: jest.fn(),
    t: createTranslator('en'),
    online: true,
    realtimeHealthy: true,
    setRealtimeHealthy: jest.fn(),
    lastSyncedAt: null,
    markSynced: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  };
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <OdinContext value={value}>{children}</OdinContext>;
  };
}

function ok<T>(value: T): CommandResult<T> {
  return { ok: true, data: value };
}

function failed(messageKey: string): CommandResult<never> {
  return { ok: false, error: commandError('VALIDATION', messageKey) };
}

async function type(label: string, value: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(label), value);
}

beforeEach(() => {
  mockParams = {};
  mockReplace.mockClear();
  mockPush.mockClear();
  data.signInWithPassword.mockReset();
  data.registerWithPassword.mockReset();
  data.requestPasswordReset.mockReset();
  data.resendConfirmation.mockReset();
});

describe('sign-in', () => {
  it('clears the password even if an unexpected exception escapes the adapter', async () => {
    data.signInWithPassword.mockRejectedValue(new Error('private provider details'));
    await render(<SignInScreen />, { wrapper: wrapper() });
    await type('Email address', 'someone@example.test');
    await type('Password', 'wrong-password');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(screen.getByLabelText('Password').props.value).toBe('');
    expect(screen.queryByText('private provider details')).toBeNull();
  });

  it('preserves the invitation destination on the recovery detour', async () => {
    mockParams = { next: '/invite' };
    await render(<SignInScreen />, { wrapper: wrapper() });
    await fireEvent.press(screen.getByLabelText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/forgot-password',
      params: { next: '/invite' },
    });
  });
  it('reports a wrong password generically and drops it from state', async () => {
    data.signInWithPassword.mockResolvedValue(failed('auth.password.invalid_credentials'));
    await render(<SignInScreen />, { wrapper: wrapper() });

    await type('Email address', 'someone@example.test');
    await type('Password', 'wrong-password');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    // One message for a wrong password and for an address with no account.
    expect(screen.getByText('Email or password is incorrect.')).toBeTruthy();
    expect(screen.getByLabelText('Password').props.value).toBe('');
    // The address survives so a retry does not mean retyping it.
    expect(screen.getByLabelText('Email address').props.value).toBe('someone@example.test');
  });

  it('never applies the new-password policy to an existing account', async () => {
    data.signInWithPassword.mockResolvedValue(ok({ id: 'u1', email: 'a@b.test' }));
    await render(<SignInScreen />, { wrapper: wrapper() });

    await type('Email address', '  someone@example.test  ');
    await type('Password', 'short');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    // Six characters reach the server: only it may judge an existing password.
    expect(data.signInWithPassword).toHaveBeenCalledWith(
      expect.anything(),
      '  someone@example.test  ',
      'short',
    );
  });

  it('starts no second request while one is still in flight', async () => {
    let settle: ((result: CommandResult<{ id: string }>) => void) | null = null;
    data.signInWithPassword.mockReturnValue(
      new Promise<CommandResult<{ id: string }>>((resolve) => {
        settle = resolve;
      }),
    );
    await render(<SignInScreen />, { wrapper: wrapper() });

    await type('Email address', 'someone@example.test');
    await type('Password', 'a-good-password');

    const button = screen.getByLabelText('Sign in');
    await fireEvent.press(button);
    expect(button).toBeDisabled();

    // Pressing again while pending must not resend. The synchronous ref that
    // closes the same gap before this re-render is covered in
    // `useAuthRequest.test.tsx`.
    await fireEvent.press(button);
    expect(data.signInWithPassword).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle?.(ok({ id: 'u1' }));
      await Promise.resolve();
    });
  });

  it.each([
    ['//evil.example', '/', 'a protocol-relative host'],
    ['https://evil.example/x', '/', 'an absolute URL'],
    // The form just completed is never a destination, or login loops.
    ['/sign-in', '/', 'the sign-in route itself'],
    ['/register', '/', 'the registration route'],
    ['/invite', '/invite', 'a genuine internal path'],
  ])('resolves %s to %s (%s)', async (next, expected) => {
    data.signInWithPassword.mockResolvedValue(ok({ id: 'u1', email: null }));
    mockParams = { next };
    await render(<SignInScreen />, { wrapper: wrapper() });

    await type('Email address', 'someone@example.test');
    await type('Password', 'a-good-password');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    expect(mockReplace).toHaveBeenCalledWith(expected);
  });

  it('offers a resend only once the server says the email is unconfirmed', async () => {
    data.signInWithPassword.mockResolvedValue(failed('auth.password.unconfirmed'));
    data.resendConfirmation.mockResolvedValue(ok(null));
    await render(<SignInScreen />, { wrapper: wrapper() });

    expect(screen.queryByLabelText('Resend confirmation email')).toBeNull();

    await type('Email address', 'someone@example.test');
    await type('Password', 'a-good-password');
    await fireEvent.press(screen.getByLabelText('Sign in'));

    await fireEvent.press(screen.getByLabelText('Resend confirmation email'));
    expect(data.resendConfirmation).toHaveBeenCalledWith(
      expect.anything(),
      'someone@example.test',
      'https://odin-ten-tau.vercel.app/auth/confirmed',
    );
    // A second send is blocked by the cooldown rather than the server.
    expect(screen.getByLabelText(/You can request a new code in/)).toBeDisabled();
  });

  it('submits nothing while offline', async () => {
    await render(<SignInScreen />, { wrapper: wrapper({ online: false }) });

    await type('Email address', 'someone@example.test');
    await type('Password', 'a-good-password');

    const button = screen.getByLabelText('Sign in');
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(data.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('registration', () => {
  async function fill(password: string, confirmation: string): Promise<void> {
    await type('Email address', 'someone@example.test');
    await type('Password', password);
    await type('Confirm password', confirmation);
    await fireEvent.press(screen.getByLabelText('Create account'));
  }

  it('rejects a short password before spending a request', async () => {
    await render(<RegisterScreen />, { wrapper: wrapper() });
    await fill('short', 'short');

    expect(screen.getByText('Use at least 8 characters for your new password.')).toBeTruthy();
    expect(data.registerWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a mismatched confirmation before spending a request', async () => {
    await render(<RegisterScreen />, { wrapper: wrapper() });
    await fill('a-good-password', 'a-good-passwerd');

    expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    expect(data.registerWithPassword).not.toHaveBeenCalled();
  });

  it('clears both passwords, explains the browser step and holds off a resend', async () => {
    data.registerWithPassword.mockResolvedValue(ok({ confirmationRequired: true }));
    await render(<RegisterScreen />, { wrapper: wrapper() });
    await fill('a-good-password', 'a-good-password');

    expect(data.registerWithPassword).toHaveBeenCalledWith(
      expect.anything(),
      'someone@example.test',
      'a-good-password',
      'https://odin-ten-tau.vercel.app/auth/confirmed',
    );
    expect(screen.getByText(/Check your inbox/)).toBeTruthy();
    expect(screen.getByText(/Confirm your email in the browser/)).toBeTruthy();
    // Both fields are gone from the tree, so neither value is still held.
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByLabelText('Confirm password')).toBeNull();
    expect(screen.getByLabelText(/You can request a new code in/)).toBeDisabled();
  });

  it('routes straight on when a local stack returns a session', async () => {
    data.registerWithPassword.mockResolvedValue(ok({ confirmationRequired: false }));
    await render(<RegisterScreen />, { wrapper: wrapper() });
    await fill('a-good-password', 'a-good-password');

    expect(mockReplace).toHaveBeenLastCalledWith('/');
    expect(screen.queryByText(/Check your inbox/)).toBeNull();
  });
});

describe('password recovery', () => {
  it('returns to sign-in with the invitation destination intact', async () => {
    mockParams = { next: '/invite' };
    await render(<ForgotPasswordScreen />, { wrapper: wrapper() });
    await fireEvent.press(screen.getByLabelText('Back to sign in'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/sign-in', params: { next: '/invite' } });
  });
  it('acknowledges without revealing whether the account exists', async () => {
    data.requestPasswordReset.mockResolvedValue(ok(null));
    await render(<ForgotPasswordScreen />, { wrapper: wrapper() });

    await type('Email address', 'someone@example.test');
    await fireEvent.press(screen.getByLabelText('Send reset link'));

    expect(data.requestPasswordReset).toHaveBeenCalledWith(
      expect.anything(),
      'someone@example.test',
      'https://odin-ten-tau.vercel.app/reset-password',
    );
    expect(screen.getByText(/If an eligible account exists/)).toBeTruthy();
    expect(screen.getByText(/The link opens in your browser/)).toBeTruthy();
  });
});
