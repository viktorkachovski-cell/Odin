import { useWindowDimensions } from 'react-native';

/** Shared by the persistent tabs, floating actions and list quick add. */
export function useNavBarHeight(): number {
  const { fontScale } = useWindowDimensions();
  return 64 + 16 * Math.max(0, fontScale - 1);
}
