import type { ReactNode } from 'react';

import { useCompactChromeVisible } from './useCompactChrome.ts';

/**
 * The compact-viewport primary action. The Android client has had a floating
 * action button since launch; without one the web client's primary action
 * scrolls out of reach on a phone and never comes back.
 *
 * It is hidden entirely above the compact breakpoint, where the page header
 * carries the same action, so a pointer user never sees two of them.
 */
export function Fab({
  label,
  onClick,
  disabled = false,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean | undefined;
}): ReactNode {
  const visible = useCompactChromeVisible();

  return (
    <button
      className={visible ? 'fab' : 'fab fab--hidden'}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">＋</span>
      {label}
    </button>
  );
}
