import { Platform, ToastAndroid } from 'react-native';

/**
 * A short confirmation that disappears on its own, replacing sentences that
 * used to stay on screen after the thing they confirmed was already visible.
 * Android is the only shipped platform; elsewhere it is a no-op.
 */
export function showToast(message: string): void {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
}
