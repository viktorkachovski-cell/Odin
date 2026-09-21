import { useEffect, useState } from 'react';

/**
 * Hides compact-viewport chrome on downward scroll and reveals it on upward
 * scroll. It stays visible at the top and bottom of the content, whenever focus
 * is inside it, and whenever the user prefers reduced motion.
 *
 * The bottom navigation and the floating action button share this so the two
 * never separate: the action sits above the bar, and a visible action over a
 * hidden bar reads as a bug.
 */
export function useCompactChromeVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    let previous = window.scrollY;

    const onScroll = (): void => {
      const current = window.scrollY;
      const atTop = current <= 0;
      const atEnd = window.innerHeight + current >= document.documentElement.scrollHeight - 2;

      if (atTop || atEnd) {
        setVisible(true);
      } else if (current > previous + 4) {
        setVisible(false);
      } else if (current < previous - 4) {
        setVisible(true);
      }
      previous = current;
    };

    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('.shell__nav') !== null || target.closest('.fab') !== null)
      ) {
        setVisible(true);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  return visible;
}
