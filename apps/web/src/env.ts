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

export function readEnv(source: WebEnvSource = import.meta.env): WebEnv {
  const url = (source.VITE_SUPABASE_URL ?? '').trim();
  const key = (source.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

  const missing: string[] = [];
  if (url.length === 0) missing.push('VITE_SUPABASE_URL');
  if (key.length === 0) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (missing.length > 0) throw new MissingEnvError(missing);

  return { supabaseUrl: url, supabasePublishableKey: key };
}
