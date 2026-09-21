import { describe, expect, it } from 'vitest';
import { validateNewPassword } from './password.ts';

describe('new password policy', () => {
  it('counts characters without trimming or changing the password', () => {
    expect(validateNewPassword(' a      ', ' a      ')).toBeNull();
    expect(validateNewPassword('😀😀😀😀', '😀😀😀😀')).toBe('auth.password.too_short');
    expect(validateNewPassword('abcdefghijkl', 'abcdefghijkL')).toBe('auth.password.mismatch');
  });
});
