/**
 * Platform-independent design values. No React, no CSS: the web app maps these
 * to custom properties and the future native app maps them to its own styles,
 * so the two clients stay visually consistent without sharing widgets.
 *
 * Contrast: every `*Text` value below is checked against its paired surface at
 * 4.5:1 or better, in both themes.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** The source requirement's minimum touch target, honoured with a mouse too. */
export const MIN_TOUCH_TARGET = 44;

export const typography = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Liberation Sans', sans-serif",
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 26,
    xxl: 32,
  },
  weight: {
    regular: 400,
    medium: 500,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
  },
} as const;

export const lightColors = {
  background: '#f6f7f9',
  surface: '#ffffff',
  surfaceMuted: '#eef0f4',
  border: '#c9cdd6',
  borderStrong: '#8b919e',
  text: '#15181d',
  textMuted: '#4c525e',
  accent: '#1f5fbf',
  accentText: '#ffffff',
  success: '#1c6b3f',
  warning: '#8a5300',
  danger: '#a3231f',
  focus: '#0b4fd1',
} as const;

export const darkColors = {
  background: '#101317',
  surface: '#191d23',
  surfaceMuted: '#232830',
  border: '#3a414c',
  borderStrong: '#6d7683',
  text: '#f1f3f6',
  textMuted: '#b6bdc8',
  accent: '#7fb0ff',
  accentText: '#0a1220',
  success: '#6fd39b',
  warning: '#f0b95c',
  danger: '#ff9b94',
  focus: '#9dc1ff',
} as const;

export type ColorToken = keyof typeof lightColors;

export const breakpoints = {
  /** Below this the source-specified bottom navigation replaces the side rail. */
  compact: 860,
} as const;
