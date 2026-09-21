import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AuthUser, OdinSupabaseClient } from '@odin/data';
import { getCurrentUser, onAuthStateChange, signOut as signOutUser } from '@odin/data';
import { createTranslator, resolveLocale, type Locale } from '@odin/i18n';

import { OdinContext, type OdinContextValue } from './OdinContext.ts';
import { setRecoveryUser } from '../auth-links.ts';
import { clearPendingInvitation } from '../pending-invitation.ts';

const LOCALE_STORAGE_KEY = 'odin.locale';

function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === 'en' || stored === 'bg' ? stored : null;
  } catch {
    return null;
  }
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
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
  const userId = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(
    () => readStoredLocale() ?? resolveLocale(navigator.language),
  );
  const [realtimeHealthy, setRealtimeHealthy] = useState(true);
  const online = useOnlineStatus();

  const queryClientRef = useRef<QueryClient | null>(queryClient ?? null);
  queryClientRef.current ??= new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Conflicts and authorization failures must not be retried blindly.
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: 0 },
    },
  });
  const activeQueryClient = queryClientRef.current;

  useEffect(() => {
    let cancelled = false;
    let receivedEvent = false;
    const acceptUser = (next: AuthUser | null): void => {
      if (userId.current !== (next?.id ?? null)) activeQueryClient.clear();
      userId.current = next?.id ?? null;
      setUser(next);
    };
    getCurrentUser(client)
      .then((current) => {
        if (!cancelled && !receivedEvent) acceptUser(current);
      })
      .catch(() => {
        if (!cancelled && !receivedEvent) acceptUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    const unsubscribe = onAuthStateChange(client, (next) => {
      receivedEvent = true;
      acceptUser(next);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, activeQueryClient]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // A blocked storage API must not break language switching.
    }
  }, []);

  /** Signing out clears every cached household query, draft and subscription. */
  const signOut = useCallback(async () => {
    await signOutUser(client);
    setRecoveryUser(null);
    clearPendingInvitation();
    activeQueryClient.clear();
    setUser(null);
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
      signOut,
    }),
    [client, user, authReady, locale, setLocale, online, realtimeHealthy, signOut],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <QueryClientProvider client={activeQueryClient}>
      <OdinContext value={value}>{children}</OdinContext>
    </QueryClientProvider>
  );
}
