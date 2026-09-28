import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Whether Android currently has Odin in the foreground (docs/android.md). */
export function useAppForeground(): boolean {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      setForeground(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return foreground;
}
