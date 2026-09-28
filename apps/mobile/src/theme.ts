/**
 * Design tokens mapped to React Native values. The tokens package stays
 * platform independent, so the numbers here are the same ones the web client
 * turns into custom properties.
 */

import { useColorScheme } from 'react-native';

import { darkColors, lightColors, MIN_TOUCH_TARGET, radius } from '@odin/design-tokens';

/** Token names are fixed; the values differ per theme, so they widen to string. */
type ThemeColors = { readonly [K in keyof typeof lightColors]: string };

interface Theme {
  readonly colors: ThemeColors;
  readonly radius: typeof radius;
  /** Android's own guidance is 48dp, above the source requirement's 44. */
  readonly touchTarget: number;
}

const touchTarget = Math.max(MIN_TOUCH_TARGET, 48);
const LIGHT: Theme = { colors: lightColors, radius, touchTarget };
const DARK: Theme = { colors: darkColors, radius, touchTarget };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
