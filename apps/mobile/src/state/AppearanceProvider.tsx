import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';

import {
  readAppearance,
  writeAppearance,
  type AppearancePreference,
} from '../appearance/preference.ts';

/**
 * Holds the member's light/dark choice for this device.
 *
 * Screens read the choice from here rather than waiting for Android to report
 * a configuration change, so a pick repaints at once. Android is told as well,
 * through `Appearance.setColorScheme`, so the status bar, native alerts and the
 * date picker match the screens.
 */

interface AppearanceState {
  readonly preference: AppearancePreference;
  readonly setPreference: (next: AppearancePreference) => void;
}

const AppearanceContext = createContext<AppearanceState>({
  preference: 'system',
  setPreference: () => undefined,
});

function applyToAndroid(preference: AppearancePreference): void {
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function AppearanceProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [preference, setState] = useState<AppearancePreference>('system');
  // A pick made before the saved value loads must not be overwritten by it.
  const chosen = useRef(false);

  useEffect(() => {
    let live = true;
    void readAppearance().then((saved) => {
      if (!live || chosen.current) return;
      setState(saved);
      if (saved !== 'system') applyToAndroid(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  const setPreference = useCallback((next: AppearancePreference) => {
    chosen.current = true;
    setState(next);
    applyToAndroid(next);
    // The choice still holds for this session; only the next launch forgets it.
    writeAppearance(next).catch(() => {
      console.warn('Odin could not save the appearance setting.');
    });
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceState {
  return useContext(AppearanceContext);
}
