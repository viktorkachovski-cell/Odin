import type { ReactNode } from 'react';

import { avatarLightness, avatarSaturation } from '@odin/design-tokens';
import { avatarHue, initialsOf } from '@odin/domain';

/**
 * Initials on a deterministic hue. The avatar is decorative: the member's name
 * always appears next to it, so colour is never the only identifier.
 *
 * The saturation and lightness come from the tokens rather than being fixed
 * here, so the generated colour stays inside the warm palette instead of
 * reading as candy against parchment.
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
    <span
      aria-hidden="true"
      className="avatar"
      style={{ background: `hsl(${hue} ${avatarSaturation}% ${avatarLightness}%)` }}
    >
      {initialsOf(displayName)}
    </span>
  );
}
