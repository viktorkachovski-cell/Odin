import { Slot } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AuthGate } from '../../src/state/AuthGate.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { NavVisibilityProvider, useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { NotificationsProvider } from '../../src/state/NotificationSettings.tsx';
import { BottomNav } from '../../src/components/BottomNav.tsx';

/**
 * The authenticated shell. The bottom navigation lives above the routed screen
 * so its hide-on-scroll state survives navigation between the four sections.
 *
 * Notifications are mounted here rather than on a screen: the watcher has to
 * keep reading My Tasks and Unassigned whichever section is open, and while
 * the app is in the background with no screen focused at all.
 */

function Shell(): ReactNode {
  const { t } = useOdin();
  const nav = useNavVisibility();

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <BottomNav onFocusEnter={() => nav.pin(true)} t={t} visible={nav.visible} />
    </View>
  );
}

export default function AppLayout(): ReactNode {
  return (
    <AuthGate>
      <NotificationsProvider>
        <NavVisibilityProvider>
          <Shell />
        </NavVisibilityProvider>
      </NotificationsProvider>
    </AuthGate>
  );
}
