import type { ReactNode } from 'react';

import { useCompactChromeVisible } from './useCompactChrome.ts';

/**
 * The compact-viewport primary action, so it never scrolls out of reach on a
 * phone. Hidden above the compact breakpoint, where the page header carries
 * the same action.
 */
export function Fab({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): ReactNode {
  const visible = useCompactChromeVisible();

  return (
    <button className={visible ? 'fab' : 'fab fab--hidden'} onClick={onClick} type="button">
      <span aria-hidden="true">＋</span>
      {label}
    </button>
  );
}
