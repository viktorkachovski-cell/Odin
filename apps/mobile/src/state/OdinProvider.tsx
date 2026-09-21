import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AuthUser, OdinSupabaseClient } from '@odin/data';
import { getCurrentUser, onAuthStateChange, signOut as signOutUser } from '@odin/data';
import { createTranslator, resolveLocale, type Locale } from '@odin/i18n';

import { OdinContext, type OdinContextValue } from './OdinContext.ts';
import { clearPendingInvitation } from './pending-invitation.ts';
import { useSessionRefresh } from './useSessionRefresh.ts';
import { useInvitationLinks } from './useInvitationLinks.ts';

/**
 * The language preference lives on the server profile rather than in device
 * storage, so it follows the account across devices. Before sign-in the device
 * locale chooses the default.
 */
function deviceLocale(): Locale {
  const [first] = getLocales();
  return resolveLocale(first?.languageTag ?? null);
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null while the probe is still running; only a
      // definite false means offline, so a slow probe never disables the UI.
      const reachable = state.isInternetReachable;
      setOnline(state.isConnected === true && reachable !== false);
    });
  }, []);

  return online;
}

export interface OdinProviderProps {
  readonly client: OdinSupabaseClient;
  readonly children: ReactNode;
  /** Tests inject their own client so no query is ever retried against a network. */
  readonly queryClient?: QueryClient;
}

export function OdinProvider({ client, children, queryClient }: OdinProviderProps): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locale, setLocale] = useState<Locale>(deviceLocale);
  const [realtimeHealthy, setRealtimeHealthy] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const online = useOnlineStatus();
  useSessionRefresh(client);
  useInvitationLinks();

  // The identity the cache currently belongs to, and whether a live auth event
  // has already superseded the initial session lookup.
  const identityRef = useRef<string | null>(null);

  const queryClientRef = useRef<QueryClient | null>(queryClient ?? null);
  queryClientRef.current ??= new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Conflicts and authorization failures must not be retried blindly.
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
  const activeQueryClient = queryClientRef.current;

  /**
   * Every identity change funnels through here so no screen can render one
   * account's cached data while another account is signed in. Switching users
   * -- and signing out -- drops every household query, draft and subscription
   * before the new user is published to the tree.
   */
  const applyUser = useCallback(
    (next: AuthUser | null) => {
      const nextId = next?.id ?? null;
      if (identityRef.current !== nextId) {
        activeQueryClient.clear();
        setLastSyncedAt(null);
        setLocale(deviceLocale());
        // Only a change away from a signed-in account discards the invitation;
        // signing in to redeem one must keep it.
        if (identityRef.current !== null) clearPendingInvitation();
        identityRef.current = nextId;
      }
      setUser(next);
    },
    [activeQueryClient],
  );

  useEffect(() => {
    let cancelled = false;
    let authEventSeen = false;

    // Subscribing before the lookup means no event can slip through the gap.
    const unsubscribe = onAuthStateChange(client, (next) => {
      if (cancelled) return;
      authEventSeen = true;
      applyUser(next);
      setAuthReady(true);
    });

    getCurrentUser(client)
      .then((current) => {
        // An auth event that landed while this lookup was in flight is the
        // newer truth; applying a slow lookup now would resurrect the identity
        // the event just replaced.
        if (!cancelled && !authEventSeen) applyUser(current);
      })
      .catch(() => {
        if (!cancelled && !authEventSeen) applyUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, applyUser]);

  const markSynced = useCallback(() => setLastSyncedAt(Date.now()), []);

  /** An explicit sign-out also drops any invitation captured before logging in. */
  const signOut = useCallback(async () => {
    await signOutUser(client);
    clearPendingInvitation();
    applyUser(null);
  }, [client, applyUser]);

  const value = useMemo<OdinContextValue>(
    () => ({
      client,
      user,
      authReady,
      locale,
      setLocale,
      t: createTranslator(locale),
      online,
      realtimeHealthy,
      setRealtimeHealthy,
      lastSyncedAt,
      markSynced,
      signOut,
    }),
    [client, user, authReady, locale, online, realtimeHealthy, lastSyncedAt, markSynced, signOut],
  );

  return (
    <QueryClientProvider client={activeQueryClient}>
      <OdinContext value={value}>
        <Fragment key={user?.id ?? 'signed-out'}>{children}</Fragment>
      </OdinContext>
    </QueryClientProvider>
  );
}
