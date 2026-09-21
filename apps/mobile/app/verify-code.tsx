import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

/**
 * Retired route. Password sign-in replaced one-time codes, but an older build,
 * a saved link or a back-stack entry can still resolve here, so the route stays
 * and hands over to sign-in rather than failing to resolve.
 *
 * The OTP exports in `@odin/data` are deliberately left in place for builds
 * still on the old flow; nothing here calls them.
 */
export default function VerifyCodeScreen(): ReactNode {
  return <Redirect href="/sign-in" />;
}
