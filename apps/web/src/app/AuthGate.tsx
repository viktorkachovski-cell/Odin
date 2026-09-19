import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useOdin } from './OdinContext.ts';
import { useHouseholdQuery, useProfileQuery } from './queries.ts';
import { useHouseholdRealtime } from './useHouseholdRealtime.ts';
import { Onboarding } from '../routes/Onboarding.tsx';

/**
 * Guards the authenticated area. A signed-out deep link is preserved as `next`
 * so the visitor lands where they intended after sign-in, and an account with no
 * profile or no active household is routed into onboarding instead of an empty
 * Home.
 *
 * The profile is read separately from the household because `get_my_household`
 * reports only membership, and `create_household` requires a profile to exist.
 */

export function AuthGate({ children }: { readonly children: ReactNode }): ReactNode {
  const { user, authReady, t } = useOdin();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useProfileQuery();
  const household = useHouseholdQuery();

  useEffect(() => {
    if (!authReady || user !== null) return;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    void navigate(`/sign-in?next=${next}`, { replace: true });
  }, [authReady, user, location.pathname, location.search, navigate]);

  // Subscriptions are keyed on the active household and torn down when it changes.
  useHouseholdRealtime(household.data?.id ?? null);

  if (!authReady) return <p role="status">{t('state.loading')}</p>;
  if (user === null) return null;
  if (profile.isPending || household.isPending) {
    return <p role="status">{t('state.loading')}</p>;
  }

  if (profile.data === null || profile.data === undefined) {
    return <Onboarding needsProfile />;
  }
  if (household.data === null || household.data === undefined) {
    return <Onboarding needsProfile={false} />;
  }

  return <>{children}</>;
}
