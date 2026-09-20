import { act, renderHook } from '@testing-library/react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useBottomNavVisibility } from './useBottomNavVisibility.ts';

/** Minimal scroll event: only the fields the visibility rule reads. */
function scrollTo(offset: number, contentHeight = 2000): NativeSyntheticEvent<NativeScrollEvent> {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y: offset },
      contentSize: { width: 400, height: contentHeight },
      layoutMeasurement: { width: 400, height: 800 },
    },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

describe('bottom navigation visibility', () => {
  it('starts visible', async () => {
    const { result } = await renderHook(() => useBottomNavVisibility());
    expect(result.current.visible).toBe(true);
  });

  it('hides on a downward scroll and reveals on an upward one', async () => {
    const { result } = await renderHook(() => useBottomNavVisibility());

    await act(() => {
      result.current.onScroll(scrollTo(400));
    });
    expect(result.current.visible).toBe(false);

    await act(() => {
      result.current.onScroll(scrollTo(300));
    });
    expect(result.current.visible).toBe(true);
  });

  it('ignores jitter below the drag threshold', async () => {
    const { result } = await renderHook(() => useBottomNavVisibility());

    await act(() => {
      result.current.onScroll(scrollTo(400));
    });
    expect(result.current.visible).toBe(false);

    await act(() => {
      result.current.onScroll(scrollTo(396));
    });
    // A four-pixel twitch upwards must not flip the navigation back.
    expect(result.current.visible).toBe(false);
  });

  it('stays visible at the top of the content', async () => {
    const { result } = await renderHook(() => useBottomNavVisibility());

    await act(() => {
      result.current.onScroll(scrollTo(400));
      result.current.onScroll(scrollTo(0));
    });

    expect(result.current.visible).toBe(true);
  });

  it('stays visible at the end of the content', async () => {
    const { result } = await renderHook(() => useBottomNavVisibility());

    await act(() => {
      result.current.onScroll(scrollTo(400));
    });
    expect(result.current.visible).toBe(false);

    await act(() => {
      // 1200 + 800 viewport reaches the bottom of 2000 points of content.
      result.current.onScroll(scrollTo(1200));
    });
    expect(result.current.visible).toBe(true);
  });

  it('stays visible while a screen pins it', async () => {
    const { result } = await renderHook(() => useBottomNavVisibility());

    await act(() => {
      result.current.pin(true);
    });
    await act(() => {
      result.current.onScroll(scrollTo(400));
    });

    expect(result.current.visible).toBe(true);
  });
});
