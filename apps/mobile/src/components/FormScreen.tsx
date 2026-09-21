import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from './Screen.tsx';

/** Scrollable forms stay reachable with the keyboard and large system text. */
export function FormScreen({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}): ReactNode {
  const insets = useSafeAreaInsets();
  return (
    <Screen title={title}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
