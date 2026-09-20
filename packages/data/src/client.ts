/**
 * The single place the Supabase SDK is constructed. Screens never import the
 * SDK: they go through the repositories and commands re-exported by this
 * package (enforced by the `no-restricted-imports` rule in eslint.config.mjs).
 *
 * Session storage is injected so the web app can use the normal browser
 * mechanism while a native app supplies secure storage, without this package
 * depending on either platform.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odin/contracts';

export interface OdinClientConfig {
  /** Public project URL, e.g. https://<ref>.supabase.co */
  readonly url: string;
  /** Public, environment-scoped publishable key. Never a service key. */
  readonly publishableKey: string;
}

/** Matches the subset of the Web Storage API the auth client needs. */
export interface SessionStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface OdinClientOptions {
  readonly storage?: SessionStorageAdapter;
  /** Native apps have no URL to parse; the web app opts in. */
  readonly detectSessionInUrl?: boolean;
}

export type OdinSupabaseClient = SupabaseClient<Database>;

export function createOdinClient(
  config: OdinClientConfig,
  options: OdinClientOptions = {},
): OdinSupabaseClient {
  if (config.url.length === 0 || config.publishableKey.length === 0) {
    throw new Error(
      'Odin client requires a Supabase URL and publishable key. Check the environment configuration.',
    );
  }

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: options.detectSessionInUrl ?? false,
      ...(options.storage === undefined ? {} : { storage: options.storage }),
    },
  });
}
