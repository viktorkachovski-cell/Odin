/**
 * Public, environment-scoped client configuration. Expo inlines `EXPO_PUBLIC_`
 * values at build time exactly as Vite inlines `VITE_`, so a release binary
 * carries whatever was set when it was built and cannot be reconfigured
 * afterwards. Secrets must never use this prefix.
 *
 * The rules here deliberately match `apps/web/src/env.ts`: a present but
 * malformed URL would otherwise pass a presence check and then fail on every
 * request.
 */

export interface MobileEnv {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

type MobileEnvSource = Partial<
  Record<'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', string>
>;

/**
 * Expo's Babel transform only substitutes *static* `process.env.EXPO_PUBLIC_*`
 * member expressions, so every name is read explicitly here. Passing
 * `process.env` around instead would silently produce an unconfigured build.
 */
function inlinedEnv(): MobileEnvSource {
  return {
    ...(process.env.EXPO_PUBLIC_SUPABASE_URL === undefined
      ? {}
      : { EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL }),
    ...(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY === undefined
      ? {}
      : { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }),
  };
}

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

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]']);

/**
 * Returns the origin so a configured trailing slash or path cannot produce
 * doubled separators in request URLs. `10.0.2.2` is the Android emulator's
 * route to the host machine, which is how a local Supabase stack is reached.
 */
function supabaseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidEnvError('EXPO_PUBLIC_SUPABASE_URL', 'expected an absolute URL');
  }

  const loopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname);
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new InvalidEnvError('EXPO_PUBLIC_SUPABASE_URL', 'expected https, or http on localhost');
  }

  return url.origin;
}

export function readEnv(source: MobileEnvSource = inlinedEnv()): MobileEnv {
  const url = (source.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

  const missing: string[] = [];
  if (url.length === 0) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (key.length === 0) missing.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (missing.length > 0) throw new MissingEnvError(missing);

  return { supabaseUrl: supabaseOrigin(url), supabasePublishableKey: key };
}

/**
 * Base for invitation links. When the web client's origin is configured the
 * link matches the one the web app produces, so a recipient without the Android
 * app installed can still redeem it in a browser. Without it, only the app's
 * own scheme is available and the link is useless to anyone who has not
 * installed the app -- see docs/android.md.
 */
export function inviteLinkBase(): string {
  const origin = (process.env.EXPO_PUBLIC_WEB_ORIGIN ?? '').trim();
  return origin.length === 0 ? 'odin://invite' : `${origin.replace(/\/+$/, '')}/invite`;
}

/** The token travels in the fragment so it never reaches a request path or log. */
export function inviteLink(token: string): string {
  return `${inviteLinkBase()}#token=${encodeURIComponent(token)}`;
}
