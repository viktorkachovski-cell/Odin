import type { ReactNode } from 'react';

/**
 * Stroke icons drawn inline, so they render the same on every OS. The text
 * glyphs they replace (⌂ ? ☺ ☷) came from whichever font the platform had and
 * did not read as the destinations they stood for. Every icon is decorative:
 * the control beside or around it always carries a text label or aria-label.
 */

export type IconName =
  | 'today'
  | 'tasks'
  | 'lists'
  | 'settings'
  | 'plus'
  | 'chevron-down'
  | 'more'
  | 'search'
  | 'close'
  | 'reorder'
  | 'check'
  | 'blocked'
  | 'arrow-up'
  | 'arrow-down';

const PATHS: Record<IconName, ReactNode> = {
  today: (
    <>
      <rect height="12.5" rx="2" width="14" x="3" y="4.5" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
    </>
  ),
  tasks: (
    <>
      <path d="M8.5 5.5h8.5M8.5 10h8.5M8.5 14.5h8.5" />
      <path d="M3 5.5l1.3 1.3L6.3 4.6M3 10l1.3 1.3 2-2.2M3 14.5l1.3 1.3 2-2.2" />
    </>
  ),
  lists: (
    <>
      <path d="M10 3l7 3.8-7 3.8-7-3.8L10 3z" />
      <path d="M3 10.6l7 3.8 7-3.8M3 14.2l7 3.8 7-3.8" />
    </>
  ),
  settings: (
    <>
      <path d="M3.5 6h8M15.5 6h1M3.5 14h2M9.5 14h7" />
      <circle cx="13.5" cy="6" r="2" />
      <circle cx="7.5" cy="14" r="2" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  'chevron-down': <path d="M5 8l5 5 5-5" />,
  more: (
    <>
      <circle cx="4.5" cy="10" fill="currentColor" r="1.3" stroke="none" />
      <circle cx="10" cy="10" fill="currentColor" r="1.3" stroke="none" />
      <circle cx="15.5" cy="10" fill="currentColor" r="1.3" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13 13l4 4" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5L5 15" />,
  reorder: <path d="M7 4v12M7 4L4 7M7 4l3 3M13 16V4M13 16l-3-3M13 16l3-3" />,
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
  blocked: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M5 15L15 5" />
    </>
  ),
  'arrow-up': <path d="M10 16V4M5 9l5-5 5 5" />,
  'arrow-down': <path d="M10 4v12M5 11l5 5 5-5" />,
};

export function Icon({
  name,
  size = 20,
}: {
  readonly name: IconName;
  readonly size?: number;
}): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 20 20"
      width={size}
    >
      {PATHS[name]}
    </svg>
  );
}
