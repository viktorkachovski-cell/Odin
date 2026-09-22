import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * The source requires the bottom navigation to hide on downward scroll and
 * reveal on upward scroll. It must stay visible at the top and at the end of
 * the content, and the hiding behaviour is suspended entirely when the user has
 * asked the system to reduce motion -- an approved accessibility accommodation
 * recorded in docs/android.md rather than a silent change.
 */

/** Ignore jitter; only a deliberate drag changes visibility. */
const SCROLL_THRESHOLD = 12;
/** Treated as "at the end of the content". */
const END_SLACK = 24;

export interface BottomNavVisibility {
  readonly visible: boolean;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Screens call this while a form needs the navigation pinned. */
  readonly pin: (pinned: boolean) => void;
}

export function useBottomNavVisibility(): BottomNavVisibility {
  const [visible, setVisible] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const lastOffset = useRef(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        // A platform without the query keeps the default motion behaviour.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offset = contentOffset.y;
    const delta = offset - lastOffset.current;
    lastOffset.current = offset;

    const atTop = offset <= 0;
    const atEnd = offset + layoutMeasurement.height >= contentSize.height - END_SLACK;
    if (atTop || atEnd) {
      setVisible(true);
      return;
    }
    if (Math.abs(delta) < SCROLL_THRESHOLD) return;
    setVisible(delta < 0);
  }, []);

  const pin = useCallback((next: boolean) => {
    setPinned(next);
    if (next) setVisible(true);
  }, []);

  return { visible: visible || pinned || reduceMotion, onScroll, pin };
}
