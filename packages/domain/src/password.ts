/** New passwords only. Never impose a new policy when logging into an existing account. */
export const PASSWORD_MIN_LENGTH = 8;

export function validateNewPassword(
  password: string,
  confirmation: string,
): 'auth.password.too_short' | 'auth.password.mismatch' | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return 'auth.password.too_short';
  if (password !== confirmation) return 'auth.password.mismatch';
  return null;
}
