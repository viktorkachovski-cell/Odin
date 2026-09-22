import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useOdin } from '../state/OdinContext.ts';
import { useNotificationSettings } from '../state/NotificationSettings.tsx';
import { SecondaryButton } from './Button.tsx';
import { useTheme } from '../theme.ts';

/**
 * The member's switch for this device's notifications.
 *
 * Android owns the permission and the member owns the mute, so the control
 * reports the combined answer rather than its own idea of it. Once Android has
 * been told "don't ask again" no button here can undo that, and offering one
 * would be a lie -- that case explains where the setting actually lives.
 */
export function NotificationToggle(): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  const { permission, muted, busy, enable, disable } = useNotificationSettings();

  if (permission === 'blocked') {
    return (
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        {t('settings.notifications.blocked')}
      </Text>
    );
  }

  const on = permission === 'granted' && !muted;

  return (
    <View style={styles.group}>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>
        {on ? t('settings.notifications.on') : t('settings.notifications.off')}
      </Text>
      <SecondaryButton
        label={on ? t('settings.notifications.disable') : t('settings.notifications.enable')}
        onPress={on ? disable : enable}
        pending={busy}
      />
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        {t('settings.notifications.device_only')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  note: { fontSize: 13 },
});
