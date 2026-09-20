import { Slot } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AuthGate } from '../../src/state/AuthGate.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { NavVisibilityProvider, useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { BottomNav } from '../../src/components/BottomNav.tsx';

/**
 * The authenticated shell. The bottom navigation lives above the routed screen
 * so its hide-on-scroll state survives navigation between the four sections.
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
      <NavVisibilityProvider>
        <Shell />
      </NavVisibilityProvider>
    </AuthGate>
  );
}
