import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import type * as ReactTypes from 'react';
import type * as ReactNativeTypes from 'react-native';
import { createTranslator } from '@odin/i18n';

const mockProfile = {
  data: null as null | { locale: 'en' | 'bg' },
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: jest.fn(),
};
const mockHousehold = {
  data: null as null | { id: string },
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: jest.fn(),
};
const mockContext = {
  user: { id: 'u1' } as { id: string } | null,
  authReady: true,
  online: true,
  t: createTranslator('en'),
  locale: 'en',
  setLocale: jest.fn(),
  realtimeHealthy: true,
  setRealtimeHealthy: jest.fn(),
  lastSyncedAt: null,
  markSynced: jest.fn(),
  signOut: jest.fn(),
  client: {},
};

jest.mock('./OdinContext.ts', () => ({ useOdin: () => mockContext }));
jest.mock('./queries.ts', () => ({
  useProfileQuery: () => mockProfile,
  useHouseholdQuery: () => mockHousehold,
}));
jest.mock('./useHouseholdRealtime.ts', () => ({ useHouseholdRealtime: jest.fn() }));
jest.mock('expo-router', () => {
  const mockReact = jest.requireActual<Pick<typeof ReactTypes, 'createElement'>>('react');
  const mockText = jest.requireActual<Pick<typeof ReactNativeTypes, 'Text'>>('react-native').Text;
  return {
    Redirect: ({ href }: { href: string }) =>
      mockReact.createElement(mockText, null, `redirect:${href}`),
    router: { replace: jest.fn() },
  };
});
jest.mock('@odin/data', () => ({
  OdinError: class extends Error {},
  keysAffectedByMembershipChange: () => [],
  useCommand: () => ({ state: { error: null, pending: false }, run: jest.fn() }),
}));

import { AuthGate } from './AuthGate.tsx';
import OnboardingScreen from '../../app/onboarding.tsx';

beforeEach(() => {
  mockProfile.data = null;
  mockProfile.isPending = false;
  mockProfile.isError = false;
  mockProfile.error = null;
  mockHousehold.data = null;
  mockHousehold.isPending = false;
  mockHousehold.isError = false;
  mockHousehold.error = null;
  mockContext.user = { id: 'u1' };
  jest.clearAllMocks();
});

it.each(['profile', 'household'])(
  'offers retry instead of onboarding when %s fails',
  async (which) => {
    const query = which === 'profile' ? mockProfile : mockHousehold;
    query.isError = true;
    query.error = new Error('private provider details');
    await render(
      <AuthGate>
        <Text>private content</Text>
      </AuthGate>,
    );
    expect(screen.queryByText('redirect:/onboarding')).toBeNull();
    expect(screen.queryByText('private content')).toBeNull();
    expect(screen.queryByText('private provider details')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockProfile.refetch).toHaveBeenCalledTimes(1);
    expect(mockHousehold.refetch).toHaveBeenCalledTimes(1);
  },
);

it('hydrates the saved profile language and renders an existing household', async () => {
  mockProfile.data = { locale: 'bg' };
  mockHousehold.data = { id: 'h1' };
  await render(
    <AuthGate>
      <Text>private content</Text>
    </AuthGate>,
  );
  expect(screen.getByText('private content')).toBeTruthy();
  expect(mockContext.setLocale).toHaveBeenCalledWith('bg');
});

it('asks an invited new user for a profile, then opens their existing household', async () => {
  mockHousehold.data = { id: 'h1' };
  const view = await render(<OnboardingScreen />);
  expect(screen.getByLabelText('Display name')).toBeTruthy();
  mockProfile.data = { locale: 'en' };
  await view.rerender(<OnboardingScreen />);
  expect(screen.getByText('redirect:/')).toBeTruthy();
});

it('does not offer household creation on an onboarding query error', async () => {
  mockProfile.isError = true;
  mockProfile.error = new Error('failed');
  await render(<OnboardingScreen />);
  expect(screen.getByLabelText('Try again')).toBeTruthy();
  expect(screen.queryByLabelText('Display name')).toBeNull();
});

it('sends a signed-out direct onboarding visitor to sign-in', async () => {
  mockContext.user = null;
  mockProfile.isPending = true;
  await render(<OnboardingScreen />);
  expect(screen.getByText('redirect:/sign-in')).toBeTruthy();
});
