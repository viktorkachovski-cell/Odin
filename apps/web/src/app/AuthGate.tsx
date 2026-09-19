import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useOdin } from './OdinContext.ts';
import { useHouseholdQuery } from './queries.ts';
import { useHouseholdRealtime } from './useHouseholdRealtime.ts';
import { Onboarding } from '../routes/Onboarding.tsx';

/**
 * Guards the authenticated area. A signed-out deep link is preserved as `next`
 * so the visitor lands where they intended after sign-in, and an account with
 * no profile or no active household is routed into onboarding instead of an
 * empty Home.
 */

export function AuthGate({ children }: { readonly children: ReactNode }): ReactNode {
  const { user, authReady, t } = useOdin();
  const navigate = useNavigate();
  const location = useLocation();
  const household = useHouseholdQuery();

  useEffect(() => {
    if (!authReady || user !== null) return;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    void navigate(`/sign-in?next=${next}`, { replace: true });
  }, [authReady, user, location.pathname, location.search, navigate]);

  // Subscriptions are keyed on the active household and torn down when it changes.
  useHouseholdRealtime(household.data?.household?.id ?? null);

  if (!authReady || (user !== null && household.isPending)) {
    return <p role="status">{t('state.loading')}</p>;
  }

  if (user === null) return null;

  const context = household.data;
  if (context === undefined) return <p role="status">{t('state.loading')}</p>;

  if (context.profile === null) return <Onboarding needsProfile />;
  if (context.household === null) return <Onboarding needsProfile={false} />;

  return <>{children}</>;
}
