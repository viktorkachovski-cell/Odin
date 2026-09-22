import * as SecureStore from 'expo-secure-store';

/**
 * The member's own on/off switch, separate from the Android permission.
 *
 * Notifications are a property of this device, not of the account, so the
 * preference deliberately does not travel on the profile: muting a spare phone
 * must not silence the one in your pocket. The keystore is used because it is
 * the only key/value store this app already carries -- adding a second storage
 * module would mean another native dependency and another rebuild for one
 * boolean.
 */

const MUTED_KEY = 'odin.notifications.muted';

/** Notifications are on once Android grants permission; muting is opt-in. */
export async function readMuted(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(MUTED_KEY)) === 'true';
  } catch {
    // An unreadable keystore must not silence a member who never muted.
    return false;
  }
}

export async function writeMuted(muted: boolean): Promise<void> {
  await SecureStore.setItemAsync(MUTED_KEY, muted ? 'true' : 'false');
}
