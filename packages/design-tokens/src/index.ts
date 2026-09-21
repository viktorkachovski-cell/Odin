/**
 * Platform-independent design values. No React, no CSS: the web app maps these
 * to custom properties and the native app maps them to its own styles, so the
 * two clients stay visually consistent without sharing widgets.
 *
 * The palette is derived from the Markovo Homes apartment finish schedule:
 * latex NCS S 0500-N walls (186.9 m²), three-layer oak parquet (45.95 m²),
 * Tubadzin Breccia Fara Ivory tile (39.65 m²) and — on 1.60 m² — Tubadzin
 * Masovia Verde B Gloss, alongside RAL 6025 fern-green cabinetry. The green is
 * under one percent of the surface area and is the thing the room is remembered
 * by, which is why `accent` is spent sparingly here too.
 *
 * Contrast: every `*Text` value below is checked against its paired surface at
 * 4.5:1 or better, and every boundary colour at 3:1, in both themes.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** The source requirement's minimum touch target, honoured with a mouse too. */
export const MIN_TOUCH_TARGET = 44;

/**
 * Sizes are expressed so that lowering a control's visual weight never lowers
 * its hit area: to quieten a control, change its tier, not its box.
 */
export const sizes = {
  controlMin: MIN_TOUCH_TARGET,
  controlLg: 52,
  icon: 20,
  avatar: 28,
  /**
   * The navigation rail. Sized to the longest destination label rather than to
   * a round number: Bulgarian "Без изпълнител" needs roughly 208px once its
   * glyph, gap and padding are counted, so 224px clears both languages without
   * spending the content column on empty gutter.
   */
  rail: 224,
  contentMax: 1216,
} as const;

export const typography = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Liberation Sans', sans-serif",
  monoFamily: "ui-monospace, SFMono-Regular, Menlo, 'Liberation Mono', monospace",
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
  background: '#f2ede2',
  surface: '#fffdf8',
  surfaceMuted: '#e9dfcb',
  surfaceSunken: '#e0d4bc',
  border: '#dccdb0',
  borderStrong: '#8d7d5e',
  text: '#1f1a11',
  textMuted: '#5e5238',
  accent: '#2d6446',
  accentHover: '#255338',
  accentActive: '#1d422b',
  accentSoft: '#d9e6d9',
  accentText: '#fffdf8',
  oak: '#9a7643',
  success: '#336b48',
  successSoft: '#d9e6d9',
  warning: '#8a5310',
  warningSoft: '#f6e9cf',
  danger: '#9a352a',
  dangerHover: '#822c22',
  dangerSoft: '#f7e5df',
  focus: '#1f1a11',
  disabledSurface: '#e0d4bc',
  disabledText: '#635633',
  overlay: 'rgba(31, 26, 17, 0.44)',
  avatarText: '#241e12',
} as const;

export const darkColors = {
  background: '#15120c',
  surface: '#1e1a13',
  surfaceMuted: '#272219',
  surfaceSunken: '#110e09',
  border: '#3a3327',
  borderStrong: '#74684f',
  text: '#f3ece0',
  textMuted: '#b8ad96',
  accent: '#83c39b',
  accentHover: '#9ad3ae',
  accentActive: '#6eb287',
  accentSoft: '#1e2d22',
  accentText: '#0c1810',
  oak: '#c9a87c',
  success: '#83c39b',
  successSoft: '#1e2d22',
  warning: '#e2b165',
  warningSoft: '#2f2517',
  danger: '#e98a7b',
  dangerHover: '#f19e90',
  dangerSoft: '#2f1d18',
  focus: '#f3ece0',
  disabledSurface: '#272219',
  disabledText: '#9b9077',
  overlay: 'rgba(8, 6, 3, 0.62)',
  avatarText: '#241e12',
} as const;

export type ColorToken = keyof typeof lightColors;

/**
 * Cast in warm black rather than pure black, so a raised surface stays inside
 * the palette. Evening shadows are deeper because there is less tonal
 * separation available to do the work.
 */
export const lightShadows = {
  sm: '0 1px 2px rgba(31, 26, 17, 0.10)',
  md: '0 2px 8px rgba(31, 26, 17, 0.10)',
  lg: '0 12px 32px rgba(31, 26, 17, 0.20)',
  press: 'inset 0 1px 2px rgba(31, 26, 17, 0.16)',
} as const;

export const darkShadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.40)',
  md: '0 2px 8px rgba(0, 0, 0, 0.50)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.60)',
  press: 'inset 0 1px 2px rgba(0, 0, 0, 0.45)',
} as const;

export type ShadowToken = keyof typeof lightShadows;

/**
 * Member avatars pick a hue per user at runtime. The saturation and lightness
 * are fixed here so the generated colour stays inside the warm palette instead
 * of reading as candy against parchment.
 */
export const avatarSaturation = 32;
export const avatarLightness = 76;

export const breakpoints = {
  /** Below this the source-specified bottom navigation replaces the side rail. */
  compact: 860,
} as const;
