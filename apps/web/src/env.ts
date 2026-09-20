/**
 * Public, environment-scoped client configuration. Only `VITE_`-prefixed values
 * reach the browser bundle; secrets and OTP delivery credentials must never use
 * that prefix.
 */

export interface WebEnv {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

type WebEnvSource = Partial<Record<'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY', string>>;

export class MissingEnvError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`Missing required environment variables: ${missing.join(', ')}`);
    this.name = 'MissingEnvError';
    this.missing = missing;
  }
}

export class InvalidEnvError extends Error {
  readonly variable: string;
  readonly reason: string;

  constructor(variable: string, reason: string) {
    super(`Invalid environment variable ${variable}: ${reason}`);
    this.name = 'InvalidEnvError';
    this.variable = variable;
    this.reason = reason;
  }
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A present but malformed URL passes the emptiness check and then breaks every
 * request the client makes, so it is rejected at the same boundary. The origin
 * is returned so a configured trailing path or slash cannot produce doubled
 * separators in request URLs.
 */
function supabaseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidEnvError('VITE_SUPABASE_URL', 'expected an absolute URL');
  }

  // Plaintext is only ever acceptable against the local development stack.
  const loopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname);
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new InvalidEnvError('VITE_SUPABASE_URL', 'expected https, or http on localhost');
  }

  return url.origin;
}

export function readEnv(source: WebEnvSource = import.meta.env): WebEnv {
  const url = (source.VITE_SUPABASE_URL ?? '').trim();
  const key = (source.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

  const missing: string[] = [];
  if (url.length === 0) missing.push('VITE_SUPABASE_URL');
  if (key.length === 0) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (missing.length > 0) throw new MissingEnvError(missing);

  return { supabaseUrl: supabaseOrigin(url), supabasePublishableKey: key };
}
