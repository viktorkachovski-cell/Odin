import * as SecureStore from 'expo-secure-store';

/**
 * Light, dark, or whatever Android is set to.
 *
 * Like the notification mute, this is a property of the device rather than the
 * account, so it is kept in the keystore and survives sign-out: a shared
 * tablet's appearance is not the next member's to inherit or lose.
 */

export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

const APPEARANCE_KEY = 'odin.appearance';

function isPreference(value: string | null): value is AppearancePreference {
  return APPEARANCE_PREFERENCES.some((preference) => preference === value);
}

/** Anything unreadable or unrecognised falls back to following the device. */
export async function readAppearance(): Promise<AppearancePreference> {
  try {
    const saved = await SecureStore.getItemAsync(APPEARANCE_KEY);
    return isPreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export async function writeAppearance(preference: AppearancePreference): Promise<void> {
  await SecureStore.setItemAsync(APPEARANCE_KEY, preference);
}
