import type { ReactNode } from 'react';

import { avatarHue, initialsOf } from '@odin/domain';

/**
 * Initials on a deterministic hue. The avatar is decorative: the member's name
 * always appears next to it, so colour is never the only identifier.
 */

export function Avatar({
  userId,
  displayName,
}: {
  readonly userId: string;
  readonly displayName: string;
}): ReactNode {
  const hue = avatarHue(userId);
  return (
    <span aria-hidden="true" className="avatar" style={{ background: `hsl(${hue} 70% 78%)` }}>
      {initialsOf(displayName)}
    </span>
  );
}
