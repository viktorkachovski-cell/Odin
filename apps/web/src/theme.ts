/**
 * Publishes the shared design tokens as CSS custom properties so the stylesheet
 * and the native client read the same values from one source.
 */

import type { ColorToken, ShadowToken } from '@odin/design-tokens';
import {
  darkColors,
  darkShadows,
  lightColors,
  lightShadows,
  radius,
  sizes,
  spacing,
  typography,
} from '@odin/design-tokens';

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Colours and shadows both change with the theme, so they are applied together:
 * a shadow cast in warm black has to deepen in the dark palette to stay visible.
 * Both palettes share their token set; the literal hex types are irrelevant here.
 */
function applyPalette(
  target: HTMLElement,
  colors: Readonly<Record<ColorToken, string>>,
  shadows: Readonly<Record<ShadowToken, string>>,
): void {
  for (const [name, value] of Object.entries(colors)) {
    target.style.setProperty(`--color-${kebab(name)}`, value);
  }
  for (const [name, value] of Object.entries(shadows)) {
    target.style.setProperty(`--shadow-${kebab(name)}`, value);
  }
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(spacing)) {
    root.style.setProperty(`--space-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(radius)) {
    root.style.setProperty(`--radius-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(sizes)) {
    root.style.setProperty(`--size-${kebab(name)}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(typography.size)) {
    root.style.setProperty(`--font-size-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(typography.weight)) {
    root.style.setProperty(`--font-weight-${name}`, String(value));
  }
  for (const [name, value] of Object.entries(typography.lineHeight)) {
    root.style.setProperty(`--line-height-${name}`, String(value));
  }
  root.style.setProperty('--font-family', typography.fontFamily);
  root.style.setProperty('--font-family-mono', typography.monoFamily);

  const dark = prefersDark();
  applyPalette(root, dark ? darkColors : lightColors, dark ? darkShadows : lightShadows);
  root.style.setProperty('color-scheme', dark ? 'dark' : 'light');
}

/** Re-applies the palette when the OS theme changes mid-session. */
export function watchColorScheme(root: HTMLElement = document.documentElement): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (): void => {
    applyPalette(
      root,
      query.matches ? darkColors : lightColors,
      query.matches ? darkShadows : lightShadows,
    );
    root.style.setProperty('color-scheme', query.matches ? 'dark' : 'light');
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
