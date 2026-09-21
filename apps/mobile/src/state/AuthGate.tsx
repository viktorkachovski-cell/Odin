import { Redirect } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { LoadingState } from '../components/Screen.tsx';
import { QueryFailure } from '../components/QueryFailure.tsx';
import { useOdin } from './OdinContext.ts';
import { useHouseholdQuery, useProfileQuery } from './queries.ts';
import { useHouseholdRealtime } from './useHouseholdRealtime.ts';

/**
 * Guards the authenticated area. An account with no profile or no active
 * household is routed into onboarding rather than an empty Home.
 *
 * The profile is read separately from the household because `get_my_household`
 * reports only membership, and `create_household` requires a profile to exist.
 */
export function AuthGate({ children }: { readonly children: ReactNode }): ReactNode {
  const { user, authReady, t, setLocale } = useOdin();
  const profile = useProfileQuery();
  const household = useHouseholdQuery();

  // Subscriptions are keyed on the active household and torn down when it changes.
  useHouseholdRealtime(household.data?.id ?? null);

  useEffect(() => {
    if (profile.data) setLocale(profile.data.locale);
  }, [profile.data, setLocale]);

  if (!authReady) return <LoadingState label={t('state.loading')} />;
  if (user === null) return <Redirect href="/sign-in" />;
  if (profile.isError || household.isError) {
    return (
      <QueryFailure
        error={profile.error ?? household.error}
        onRetry={() => {
          void profile.refetch();
          void household.refetch();
        }}
      />
    );
  }
  if (profile.isPending || household.isPending) return <LoadingState label={t('state.loading')} />;

  if (profile.data === null || profile.data === undefined) return <Redirect href="/onboarding" />;
  if (household.data === null || household.data === undefined) {
    return <Redirect href="/onboarding" />;
  }

  return <>{children}</>;
}
