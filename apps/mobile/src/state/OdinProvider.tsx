import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AuthUser, OdinSupabaseClient } from '@odin/data';
import { getCurrentUser, onAuthStateChange, signOut as signOutUser } from '@odin/data';
import { createTranslator, resolveLocale, type Locale } from '@odin/i18n';

import { OdinContext, type OdinContextValue } from './OdinContext.ts';

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

  useEffect(() => {
    let cancelled = false;
    getCurrentUser(client)
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    const unsubscribe = onAuthStateChange(client, (next) => {
      setUser(next);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client]);

  const markSynced = useCallback(() => setLastSyncedAt(Date.now()), []);

  /** Signing out clears every cached household query, draft and subscription. */
  const signOut = useCallback(async () => {
    await signOutUser(client);
    activeQueryClient.clear();
    setUser(null);
    setLastSyncedAt(null);
  }, [client, activeQueryClient]);

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
      <OdinContext value={value}>{children}</OdinContext>
    </QueryClientProvider>
  );
}
