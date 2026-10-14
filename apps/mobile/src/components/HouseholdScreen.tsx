import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useOdin } from '../state/OdinContext.ts';
import { useProfileQuery } from '../state/queries.ts';
import { Avatar } from './Avatar.tsx';
import { Screen } from './Screen.tsx';

/** The four main destinations share one household heading and profile shortcut. */
export function HouseholdScreen({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}): ReactNode {
  const { t, locale, user } = useOdin();
  const profile = useProfileQuery();
  return (
    <Screen
      title={title}
      subtitle={subtitle}
      prominent
      eyebrow={t('today.household').toLocaleUpperCase(locale)}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.profile.heading')}
          onPress={() => router.navigate('/settings')}
          style={styles.profile}
        >
          <Avatar
            displayName={profile.data?.display_name ?? ''}
            userId={user?.id ?? ''}
            size={36}
          />
        </Pressable>
      }
    >
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
});
