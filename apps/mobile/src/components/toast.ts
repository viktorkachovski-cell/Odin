import { Platform, ToastAndroid } from 'react-native';

/** A short confirmation that disappears on its own. Android only; elsewhere a no-op. */
export function showToast(message: string): void {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
}
