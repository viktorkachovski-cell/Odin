import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Appearance } from 'react-native';

import { darkColors, lightColors } from '@odin/design-tokens';
import { createTranslator } from '@odin/i18n';

/**
 * The member's light/dark choice: it overrides Android, survives a restart
 * through the keystore double, and falls back to the device when nothing
 * usable is stored. The device is pinned to dark, the case that was reported.
 */

const secureStore = jest.requireMock<{
  __store: Map<string, string>;
  getItemAsync: jest.Mock;
}>('expo-secure-store');
const mockContext = { t: createTranslator('en') };

jest.mock('./OdinContext.ts', () => ({ useOdin: () => mockContext }));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'dark',
}));

import { AppearanceProvider, useAppearance } from './AppearanceProvider.tsx';
import { AppearanceChoice } from '../components/AppearanceChoice.tsx';
import { useTheme } from '../theme.ts';

const setColorScheme = jest.spyOn(Appearance, 'setColorScheme');

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <AppearanceProvider>{children}</AppearanceProvider>;
}

function useState(): { readonly preference: string; readonly background: string } {
  const { preference } = useAppearance();
  return { preference, background: useTheme().colors.background };
}

beforeEach(() => {
  secureStore.__store.clear();
  jest.clearAllMocks();
  setColorScheme.mockImplementation(() => undefined);
});

describe('the appearance choice', () => {
  it('follows the device until the member picks', async () => {
    const { result } = await renderHook(useState, { wrapper });

    await waitFor(() => expect(result.current.preference).toBe('system'));
    expect(result.current.background).toBe(darkColors.background);
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('restores a saved light choice over a dark device', async () => {
    secureStore.__store.set('odin.appearance', 'light');
    const { result } = await renderHook(useState, { wrapper });

    await waitFor(() => expect(result.current.background).toBe(lightColors.background));
    expect(setColorScheme).toHaveBeenCalledWith('light');
  });

  it('ignores a stored value it does not recognise', async () => {
    secureStore.__store.set('odin.appearance', 'sepia');
    const { result } = await renderHook(useState, { wrapper });

    await waitFor(() => expect(result.current.preference).toBe('system'));
    expect(result.current.background).toBe(darkColors.background);
  });

  it('repaints, tells Android and saves when picked in Settings', async () => {
    await render(<AppearanceChoice />, { wrapper });

    await fireEvent.press(screen.getByLabelText('Light'));
    expect(screen.getByText('● Light')).toBeTruthy();
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    await waitFor(() => expect(secureStore.__store.get('odin.appearance')).toBe('light'));

    await fireEvent.press(screen.getByLabelText('Match device'));
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    await waitFor(() => expect(secureStore.__store.get('odin.appearance')).toBe('system'));
  });

  it('keeps a pick made before the saved value finished loading', async () => {
    let finishRead: (value: string) => void = () => undefined;
    secureStore.getItemAsync.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finishRead = resolve)),
    );
    const { result } = await renderHook(useAppearance, { wrapper });

    await act(() => result.current.setPreference('light'));
    await act(() => {
      finishRead('dark');
      return Promise.resolve();
    });

    expect(result.current.preference).toBe('light');
    expect(setColorScheme).not.toHaveBeenCalledWith('dark');
  });
});
