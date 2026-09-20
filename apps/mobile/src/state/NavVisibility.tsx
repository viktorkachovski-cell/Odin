import { createContext, use, type ReactNode } from 'react';

import { useBottomNavVisibility, type BottomNavVisibility } from './useBottomNavVisibility.ts';

/**
 * Scroll happens inside each screen while the navigation is rendered by the
 * layout above it, so the visibility rule is shared through context instead of
 * being re-implemented per screen.
 */

const NavVisibilityContext = createContext<BottomNavVisibility | null>(null);

export function NavVisibilityProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const value = useBottomNavVisibility();
  return <NavVisibilityContext value={value}>{children}</NavVisibilityContext>;
}

/** Returns a no-op controller outside the shell so editors can render alone. */
export function useNavVisibility(): BottomNavVisibility {
  return (
    use(NavVisibilityContext) ?? {
      visible: true,
      onScroll: () => undefined,
      pin: () => undefined,
    }
  );
}
