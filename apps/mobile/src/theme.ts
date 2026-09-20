/**
 * Design tokens mapped to React Native values. The tokens package stays
 * platform independent, so the numbers here are the same ones the web client
 * turns into custom properties.
 */

import { useColorScheme } from 'react-native';

import {
  darkColors,
  lightColors,
  MIN_TOUCH_TARGET,
  radius,
  spacing,
  typography,
} from '@odin/design-tokens';

/** Token names are fixed; the values differ per theme, so they widen to string. */
export type ThemeColors = { readonly [K in keyof typeof lightColors]: string };

export interface Theme {
  readonly colors: ThemeColors;
  readonly dark: boolean;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly typography: typeof typography;
  /** Android's own guidance is 48dp, above the source requirement's 44. */
  readonly touchTarget: number;
}

export const ANDROID_TOUCH_TARGET = Math.max(MIN_TOUCH_TARGET, 48);

export function buildTheme(dark: boolean): Theme {
  return {
    colors: dark ? darkColors : lightColors,
    dark,
    spacing,
    radius,
    typography,
    touchTarget: ANDROID_TOUCH_TARGET,
  };
}

export function useTheme(): Theme {
  return buildTheme(useColorScheme() === 'dark');
}
