import { useEffect, useState } from 'react';
import { Keyboard, useWindowDimensions } from 'react-native';

/** Shared by the persistent tabs, floating actions and list quick add. */
export function useNavBarHeight(): number {
  const { fontScale } = useWindowDimensions();
  return 64 + 16 * Math.max(0, fontScale - 1);
}

/**
 * Height of the on-screen keyboard, or 0 while it is hidden.
 *
 * Android is edge-to-edge (mandatory since Expo SDK 54), so the window no
 * longer shrinks for the keyboard and anything pinned to the bottom ends up
 * behind it. React Native reports the height above the system navigation bar
 * (`ime - systemBars`), so a view pinned to the screen bottom sits on the
 * keyboard at this height plus the bottom safe-area inset. The show event is
 * re-sent when the height changes while open (an emoji panel, for instance).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setHeight(Math.max(0, event.endCoordinates.height));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
