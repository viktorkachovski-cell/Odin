import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether Android currently has Odin in the foreground.
 *
 * Two unrelated rules depend on this answer -- authoritative membership is
 * re-read on return to the foreground, and a notification is only presented
 * while the member is *not* looking at the app -- so they share one reading
 * rather than each keeping their own listener.
 */
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
