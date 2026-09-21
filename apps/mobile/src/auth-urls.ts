/**
 * Confirmation and password-recovery emails open the deployed web pages, not a
 * native screen. Both are fixed constants on purpose: deriving either from an
 * email address, an invitation, a route parameter, a preview deployment or any
 * other deep link would let an attacker choose where a bearer token is
 * delivered. Supabase Auth allowlists exactly these two URLs, so changing one
 * here without changing the allowlist breaks the link rather than redirecting
 * it somewhere unintended.
 *
 * After confirming or resetting in a browser the person returns to Odin and
 * signs in with the password. The browser session and the Android session stay
 * independent, which is what makes this work when the mail is opened on another
 * device.
 */

export const CONFIRMATION_URL = 'https://odin-ten-tau.vercel.app/auth/confirmed';
export const RECOVERY_URL = 'https://odin-ten-tau.vercel.app/reset-password';
