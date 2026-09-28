import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A handler with one identity for the component's life that always runs the
 * latest render's code, so memoized rows given it do not re-render. Call it
 * from events only, never while rendering.
 */
export function useEvent<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
