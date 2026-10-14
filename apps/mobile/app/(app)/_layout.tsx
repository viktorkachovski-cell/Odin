import { Slot } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { summarizeTasks } from '@odin/domain';

import { AuthGate } from '../../src/state/AuthGate.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { NotificationsProvider } from '../../src/state/NotificationSettings.tsx';
import { BottomNav } from '../../src/components/BottomNav.tsx';
import { useHouseholdTasksQuery } from '../../src/state/queries.ts';

/**
 * The authenticated shell. The bottom navigation lives above the routed screen
 * so all four destinations remain available while content scrolls.
 *
 * Notifications are mounted here rather than on a screen: the watcher has to
 * keep reading My Tasks and Unassigned whichever section is open, and while
 * the app is in the background with no screen focused at all.
 */

function Shell(): ReactNode {
  const { t, user } = useOdin();
  const tasks = useHouseholdTasksQuery();
  const mine = summarizeTasks(tasks.data?.items ?? [], user?.id ?? null).mine;

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <BottomNav badge={mine} t={t} />
    </View>
  );
}

export default function AppLayout(): ReactNode {
  return (
    <AuthGate>
      <NotificationsProvider>
        <Shell />
      </NotificationsProvider>
    </AuthGate>
  );
}
